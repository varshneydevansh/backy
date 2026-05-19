/**
 * BACKY CMS - NEW PAGE
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Code2, Copy, Download, FileText, Globe, Home, Image as ImageIcon, Layout, Menu, RefreshCw, Save, Search, Sparkles } from 'lucide-react';
import {
    createPage,
    getAdminApiBase,
    getPage,
    getSiteFrontendDesign,
    getSiteNavigation,
    getUserPermissions,
    listCollections,
    listPages,
    updateSiteNavigation,
    type AdminUserPermissionMatrix,
    type Collection,
    type CollectionField,
    type CollectionFieldType,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore, type Page } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn } from '@/lib/utils';
import { getCanvasHeightForElements, withPageChrome } from '@/lib/editorTemplateChrome';
import {
    DEFAULT_CANVAS_SIZE,
    createCanvasElement,
    serializeCanvasContent,
} from '@/components/editor/editorCatalog';
import type { CanvasElement } from '@/types/editor';
import type { SiteNavigationConfig, SiteNavigationConfigItem, SiteSettings } from '@backy-cms/core';

interface NewPageSearch {
    siteId?: string;
    template?: PageTemplate;
    title?: string;
    slug?: string;
    description?: string;
    status?: PageCreationStatus;
    scheduledAt?: string;
    isHomepage?: boolean;
    nav?: PageNavigationPlacement;
    navLabel?: string;
    parentPageId?: string;
    seoTitle?: string;
    canonical?: string;
    keywords?: string;
    jsonLd?: string;
    ogImage?: string;
    noIndex?: boolean;
    noFollow?: boolean;
    designTemplate?: string;
    collectionId?: string;
    datasetMode?: PageDatasetMode;
}

type PageTemplate = 'blank' | 'landing' | 'storefront' | 'product-detail' | 'pricing' | 'services' | 'booking' | 'portfolio' | 'gallery' | 'events' | 'privacy' | 'terms' | 'cookie-policy' | 'accessibility-statement' | 'refund-policy' | 'shipping-policy' | 'cart' | 'checkout' | 'order-confirmation' | 'help-center' | 'faq' | 'testimonials' | 'blog-index' | 'blog-post' | 'team' | 'careers' | 'about' | 'contact' | 'newsletter' | 'survey' | 'registration' | 'member-login' | 'member-account';
type PageCreationStatus = 'draft' | 'published' | 'scheduled';
type PageNavigationPlacement = 'none' | 'primary' | 'footer';
type PageDatasetMode = 'list' | 'item';
type PageCreatePermissionKey = 'pages.view' | 'pages.edit' | 'pages.publish' | 'collections.view' | 'sites.view' | 'sites.configure' | 'sites.create';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];

interface TemplatePreviewBlock {
    label?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    className: string;
}

interface PageCreateDraftState {
    title: string;
    slug: string;
    siteId: string;
    template: PageTemplate;
    status: PageCreationStatus;
    scheduledAt: string | null;
    isHomepage: boolean;
    description: string;
    parentPageId: string;
    navigationPlacement: PageNavigationPlacement;
    navigationLabel: string;
    seoTitle: string;
    canonicalPath: string;
    keywords: string;
    jsonLdText: string;
    ogImage: string;
    noIndex: boolean;
    noFollow: boolean;
    designTemplateId: string;
    collectionId: string;
    datasetMode: PageDatasetMode | '';
}

interface PageCreateAutosaveDraft {
    version: 1;
    savedAt: string;
    formData: PageCreateDraftState;
}

const PAGE_CREATE_AUTOSAVE_KEY = 'backy:page-new:draft:v1';

const PAGE_CREATE_PERMISSION_ROLE_DEFAULTS: Record<PageCreatePermissionKey, Array<AuthUser['role']>> = {
    'pages.view': ['owner', 'admin', 'editor', 'viewer'],
    'pages.edit': ['owner', 'admin', 'editor'],
    'pages.publish': ['owner', 'admin', 'editor'],
    'collections.view': ['owner', 'admin', 'editor', 'viewer'],
    'sites.view': ['owner', 'admin', 'editor', 'viewer'],
    'sites.configure': ['owner', 'admin'],
    'sites.create': ['owner', 'admin'],
};

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
        id: 'storefront',
        name: 'Storefront page',
        desc: 'Product hero, catalog rail, and checkout-ready cards.',
        detail: 'Starts a public selling page that can bind to Backy products and orders.',
        sections: ['Product hero', 'Catalog grid', 'Checkout CTA'],
    },
    {
        id: 'product-detail',
        name: 'Product detail',
        desc: 'Product media, price, options, buy button, and related items.',
        detail: 'Creates a focused product page that custom frontends can bind to a single product record.',
        sections: ['Product media', 'Purchase panel', 'Related products'],
    },
    {
        id: 'pricing',
        name: 'Pricing page',
        desc: 'Plan cards, feature comparison, subscription CTA, and pricing FAQ.',
        detail: 'Creates a public pricing page for one-time products, recurring plans, and provider checkout handoff.',
        sections: ['Pricing hero', 'Plan cards', 'Feature comparison'],
    },
    {
        id: 'services',
        name: 'Services page',
        desc: 'Service cards, format filters, booking CTAs, process steps, and FAQ.',
        detail: 'Creates a public services page ready to bind service packages, durations, prices, and booking handoff actions.',
        sections: ['Services hero', 'Service cards', 'Booking process'],
    },
    {
        id: 'booking',
        name: 'Booking page',
        desc: 'Appointment types, availability, intake fields, calendar handoff, and confirmation notes.',
        detail: 'Creates a public booking page ready to bind services, staff, locations, availability, intake questions, and scheduling-provider actions.',
        sections: ['Booking hero', 'Appointment cards', 'Scheduling CTA'],
    },
    {
        id: 'portfolio',
        name: 'Portfolio page',
        desc: 'Featured work, project filters, media-backed cards, and inquiry CTA.',
        detail: 'Creates a public portfolio page ready to bind project records, media assets, categories, and case-study links.',
        sections: ['Portfolio hero', 'Project gallery', 'Case study CTA'],
    },
    {
        id: 'gallery',
        name: 'Gallery page',
        desc: 'Media folders, image/video/file filters, featured assets, and lightbox actions.',
        detail: 'Creates a public gallery page ready to bind Backy media folders, tags, asset types, thumbnails, captions, and download or lightbox actions.',
        sections: ['Gallery hero', 'Media filters', 'Asset grid'],
    },
    {
        id: 'events',
        name: 'Events page',
        desc: 'Event cards, date/location metadata, format filters, agenda, and RSVP CTA.',
        detail: 'Creates a public events page ready to bind workshops, webinars, schedules, locations, capacity, and registration actions.',
        sections: ['Events hero', 'Event cards', 'RSVP section'],
    },
    {
        id: 'privacy',
        name: 'Privacy policy',
        desc: 'Policy summary, data-use sections, consent rights, processor notes, and contact CTA.',
        detail: 'Creates a public privacy policy page ready to bind legal settings, data categories, retention terms, and request actions.',
        sections: ['Policy hero', 'Data-use sections', 'Rights contact'],
    },
    {
        id: 'terms',
        name: 'Terms page',
        desc: 'Service terms, account rules, commerce conditions, acceptable use, and contact CTA.',
        detail: 'Creates a public terms and conditions page ready to bind legal settings, service terms, commerce rules, and dispute/contact actions.',
        sections: ['Terms hero', 'Policy sections', 'Contact action'],
    },
    {
        id: 'cookie-policy',
        name: 'Cookie policy',
        desc: 'Cookie categories, consent controls, analytics notes, marketing pixels, retention, and preferences CTA.',
        detail: 'Creates a public cookie policy page ready to bind consent settings, cookie categories, retention notes, and preference-management actions.',
        sections: ['Cookie hero', 'Category sections', 'Preferences action'],
    },
    {
        id: 'accessibility-statement',
        name: 'Accessibility statement',
        desc: 'Accessibility commitment, standards, supported features, known limitations, and feedback CTA.',
        detail: 'Creates a public accessibility statement ready to bind site standards, assistive-technology support, limitation notes, and feedback actions.',
        sections: ['Access hero', 'Standards sections', 'Feedback action'],
    },
    {
        id: 'refund-policy',
        name: 'Refund policy',
        desc: 'Return windows, refund rules, exchange options, ineligible items, and support CTA.',
        detail: 'Creates a public refund policy page ready to bind commerce settings, fulfillment rules, return workflows, and support actions.',
        sections: ['Refund hero', 'Policy rules', 'Return action'],
    },
    {
        id: 'shipping-policy',
        name: 'Shipping policy',
        desc: 'Delivery timelines, shipping methods, rates, tracking, pickup, and international rules.',
        detail: 'Creates a public shipping policy page ready to bind commerce fulfillment settings, carrier options, delivery zones, and tracking actions.',
        sections: ['Shipping hero', 'Method rules', 'Tracking action'],
    },
    {
        id: 'cart',
        name: 'Cart page',
        desc: 'Cart items, quantity controls, totals, and checkout handoff.',
        detail: 'Creates an editable cart review page that custom frontends can bind to Backy order-intake state.',
        sections: ['Cart items', 'Quantity controls', 'Order totals'],
    },
    {
        id: 'checkout',
        name: 'Checkout page',
        desc: 'Order summary, customer details, shipping choices, and provider checkout handoff.',
        detail: 'Creates a safe checkout surface that binds to Backy commerce state without collecting card data in page forms.',
        sections: ['Order summary', 'Customer details', 'Payment handoff'],
    },
    {
        id: 'order-confirmation',
        name: 'Order confirmation',
        desc: 'Receipt status, order summary, fulfillment notes, and support actions.',
        detail: 'Creates a post-purchase page that custom frontends can bind to Backy order status without exposing payment secrets.',
        sections: ['Order status', 'Receipt summary', 'Next steps'],
    },
    {
        id: 'help-center',
        name: 'Help center',
        desc: 'Search, support categories, FAQs, and escalation handoff.',
        detail: 'Creates a self-service support page for products, orders, accounts, and site content.',
        sections: ['Search hero', 'Support categories', 'FAQ answers'],
    },
    {
        id: 'faq',
        name: 'FAQ page',
        desc: 'Searchable questions, category filters, accordion answers, and support escalation CTA.',
        detail: 'Creates a public FAQ page ready to bind reusable questions, categories, answer content, and contact or support actions.',
        sections: ['FAQ hero', 'Question list', 'Support CTA'],
    },
    {
        id: 'testimonials',
        name: 'Testimonials page',
        desc: 'Customer quotes, rating summaries, source filters, proof cards, and inquiry CTA.',
        detail: 'Creates a public testimonials page ready to bind reviews, customer logos, ratings, industries, media, and trust-building actions.',
        sections: ['Proof hero', 'Review cards', 'Inquiry CTA'],
    },
    {
        id: 'blog-index',
        name: 'Blog index',
        desc: 'Editorial intro, featured story, and article list blocks.',
        detail: 'Creates a public publication route ready to bind to Backy blog posts.',
        sections: ['Editorial hero', 'Featured post', 'Article list'],
    },
    {
        id: 'blog-post',
        name: 'Blog post',
        desc: 'Article hero, post body, author card, taxonomy, and related posts.',
        detail: 'Creates a public article detail page ready to bind one Backy blog post and related editorial content.',
        sections: ['Article hero', 'Post body', 'Related posts'],
    },
    {
        id: 'team',
        name: 'Team page',
        desc: 'Leadership, staff profiles, role filters, departments, trust notes, and hiring CTA.',
        detail: 'Creates a public team page ready to bind people records, roles, departments, profile media, social links, and recruiting actions.',
        sections: ['Team hero', 'Profile cards', 'Hiring CTA'],
    },
    {
        id: 'careers',
        name: 'Careers page',
        desc: 'Open roles, job filters, benefits, hiring process, application CTA, and candidate contact.',
        detail: 'Creates a public careers page ready to bind job postings, departments, locations, employment types, benefits, and application actions.',
        sections: ['Careers hero', 'Open roles', 'Application CTA'],
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
        id: 'newsletter',
        name: 'Newsletter page',
        desc: 'Email signup, preference fields, consent, lead magnet copy, and form routing.',
        detail: 'Creates a public newsletter signup page backed by Backy Forms and Contacts without needing a custom frontend first.',
        sections: ['Signup hero', 'Preference form', 'Confirmation note'],
    },
    {
        id: 'survey',
        name: 'Survey page',
        desc: 'Survey prompt, rating/select questions, optional contact capture, consent, and submission routing.',
        detail: 'Creates a public survey page backed by Backy Forms so teams can collect structured responses without building a custom frontend first.',
        sections: ['Survey hero', 'Question form', 'Response summary'],
    },
    {
        id: 'registration',
        name: 'Registration page',
        desc: 'Signup copy, member fields, consent, and submission routing.',
        detail: 'Creates a public registration form API without needing a separate frontend first.',
        sections: ['Hero', 'Registration form', 'Consent'],
    },
    {
        id: 'member-login',
        name: 'Member login',
        desc: 'Access-link request, account copy, and registration handoff.',
        detail: 'Seeds a safe sign-in request page without storing visitor passwords in form submissions.',
        sections: ['Hero', 'Access form', 'Register link'],
    },
    {
        id: 'member-account',
        name: 'Member account',
        desc: 'Profile summary, preference form, and protected-resource cards.',
        detail: 'Starts an authenticated account page that custom frontends can connect to member state.',
        sections: ['Profile hero', 'Preferences form', 'Resource cards'],
    },
];

const TEMPLATE_DEFAULTS: Record<PageTemplate, { title: string; slug: string; description: string }> = {
    blank: { title: '', slug: '', description: '' },
    landing: {
        title: 'Landing page',
        slug: 'landing',
        description: 'A focused landing page with an editable hero, feature grid, and call to action.',
    },
    storefront: {
        title: 'Storefront',
        slug: 'store',
        description: 'A public storefront page ready to connect products, catalog sections, and checkout actions.',
    },
    'product-detail': {
        title: 'Product detail',
        slug: 'product',
        description: 'A public product detail page ready to bind media, price, variants, and checkout actions.',
    },
    pricing: {
        title: 'Pricing',
        slug: 'pricing',
        description: 'A public pricing page ready to bind plans, subscription options, features, and checkout actions.',
    },
    services: {
        title: 'Services',
        slug: 'services',
        description: 'A public services page ready to bind packages, formats, durations, booking actions, and inquiry handoff.',
    },
    booking: {
        title: 'Book an appointment',
        slug: 'booking',
        description: 'A public booking page ready to bind appointment types, staff, locations, availability, intake questions, and scheduling handoff.',
    },
    portfolio: {
        title: 'Portfolio',
        slug: 'portfolio',
        description: 'A public portfolio page ready to bind projects, media assets, categories, outcomes, and inquiry actions.',
    },
    gallery: {
        title: 'Gallery',
        slug: 'gallery',
        description: 'A public gallery page ready to bind media folders, images, videos, files, fonts, tags, captions, and lightbox or download actions.',
    },
    events: {
        title: 'Events',
        slug: 'events',
        description: 'A public events page ready to bind event records, schedules, locations, capacity, and RSVP actions.',
    },
    privacy: {
        title: 'Privacy policy',
        slug: 'privacy',
        description: 'A public privacy policy page ready to explain data collection, retention, user rights, processors, and contact options.',
    },
    terms: {
        title: 'Terms and conditions',
        slug: 'terms',
        description: 'A public terms page ready to explain service rules, account responsibilities, commerce conditions, acceptable use, and dispute handling.',
    },
    'cookie-policy': {
        title: 'Cookie policy',
        slug: 'cookie-policy',
        description: 'A public cookie policy page ready to explain essential, analytics, marketing, and preference cookies with consent controls.',
    },
    'accessibility-statement': {
        title: 'Accessibility statement',
        slug: 'accessibility',
        description: 'A public accessibility statement ready to explain standards, supported features, known limitations, and feedback options.',
    },
    'refund-policy': {
        title: 'Refund policy',
        slug: 'refund-policy',
        description: 'A public refund policy page ready to explain return windows, refund eligibility, exchange options, ineligible items, and support steps.',
    },
    'shipping-policy': {
        title: 'Shipping policy',
        slug: 'shipping-policy',
        description: 'A public shipping policy page ready to explain delivery timelines, rates, shipping methods, tracking, pickup, and international rules.',
    },
    cart: {
        title: 'Cart',
        slug: 'cart',
        description: 'A cart review page ready to bind line items, quantities, totals, discounts, and checkout handoff.',
    },
    checkout: {
        title: 'Checkout',
        slug: 'checkout',
        description: 'A checkout page ready to bind cart items, customer details, shipping choices, and provider payment handoff.',
    },
    'order-confirmation': {
        title: 'Order confirmation',
        slug: 'order-confirmation',
        description: 'A post-purchase confirmation page ready to bind receipt details, fulfillment status, and support actions.',
    },
    'help-center': {
        title: 'Help center',
        slug: 'help',
        description: 'A self-service support page ready to bind help articles, FAQs, and escalation actions.',
    },
    faq: {
        title: 'FAQ',
        slug: 'faq',
        description: 'A public FAQ page ready to answer common questions with searchable categories, accordion answers, and support escalation.',
    },
    testimonials: {
        title: 'Testimonials',
        slug: 'testimonials',
        description: 'A public testimonials page ready to showcase customer quotes, ratings, source attribution, industries, and inquiry actions.',
    },
    'blog-index': {
        title: 'Blog',
        slug: 'blog',
        description: 'A public blog index with featured posts and editable editorial sections.',
    },
    'blog-post': {
        title: 'Article',
        slug: 'article',
        description: 'A public article page ready to bind title, author, content, taxonomy, and related posts.',
    },
    team: {
        title: 'Team',
        slug: 'team',
        description: 'A public team page ready to showcase people, roles, departments, profile media, social links, and hiring or contact actions.',
    },
    careers: {
        title: 'Careers',
        slug: 'careers',
        description: 'A public careers page ready to showcase open roles, departments, benefits, hiring process, and application actions.',
    },
    about: {
        title: 'About',
        slug: 'about',
        description: 'A public about page for story, values, team, and trust-building content.',
    },
    contact: {
        title: 'Contact',
        slug: 'contact',
        description: 'A public contact page with editable copy and a Backy form connected to submissions.',
    },
    newsletter: {
        title: 'Newsletter',
        slug: 'newsletter',
        description: 'A public newsletter signup page ready to collect emails, consent, topics, and source attribution through Backy Forms and Contacts.',
    },
    survey: {
        title: 'Survey',
        slug: 'survey',
        description: 'A public survey page ready to collect structured responses, ratings, open feedback, optional contact details, and consent through Backy Forms.',
    },
    registration: {
        title: 'Member registration',
        slug: 'register',
        description: 'A public registration page with member fields, consent, and Backy form submission routing.',
    },
    'member-login': {
        title: 'Member login',
        slug: 'login',
        description: 'A public member access page where visitors request a secure sign-in link.',
    },
    'member-account': {
        title: 'Member account',
        slug: 'account',
        description: 'A protected member account page for profile details, preferences, and private resources.',
    },
};

const DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE: Record<PageTemplate, PageNavigationPlacement> = {
    blank: 'none',
    landing: 'primary',
    storefront: 'primary',
    'product-detail': 'primary',
    pricing: 'primary',
    services: 'primary',
    booking: 'primary',
    portfolio: 'primary',
    gallery: 'primary',
    events: 'primary',
    privacy: 'footer',
    terms: 'footer',
    'cookie-policy': 'footer',
    'accessibility-statement': 'footer',
    'refund-policy': 'footer',
    'shipping-policy': 'footer',
    cart: 'primary',
    checkout: 'primary',
    'order-confirmation': 'primary',
    'help-center': 'primary',
    faq: 'primary',
    testimonials: 'primary',
    'blog-index': 'primary',
    'blog-post': 'primary',
    team: 'primary',
    careers: 'primary',
    about: 'primary',
    contact: 'footer',
    newsletter: 'primary',
    survey: 'primary',
    registration: 'primary',
    'member-login': 'primary',
    'member-account': 'primary',
};

const PAGE_CREATION_AREAS = [
    {
        title: 'Page basics',
        detail: 'Target site, title, route, homepage behavior, and SEO description.',
        href: '#page-basics',
    },
    {
        title: 'Starter design',
        detail: 'Seed a real editable canvas instead of sending the editor an empty page.',
        href: '#page-design',
    },
    {
        title: 'Route preview',
        detail: 'Confirm the public path and selected site before creating the page.',
        href: '#page-preview',
    },
    {
        title: 'SEO and social',
        detail: 'Search title, canonical path, Open Graph image, and robots flags.',
        href: '#page-seo',
    },
    {
        title: 'Create payload',
        detail: 'Review the metadata and canvas handoff that will be sent to the backend.',
        href: '#page-payload',
    },
] as const;

const slugify = (value: string) => (
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
);

const routeSlugFromPattern = (value?: string) => {
    if (!value || value.includes('{')) return '';
    return slugify(value.replace(/^\/+|\/+$/g, ''));
};

const normalizeRoutePathForCreate = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') return '/';
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
};

const normalizeCollectionPatternForPageCreate = (
    value: string | null | undefined,
    collectionSlug: string,
    fallback: string,
) => normalizeRoutePathForCreate(value?.trim() || fallback)
    .split('/')
    .map((segment) => (segment === ':collectionSlug' ? collectionSlug : segment))
    .join('/') || '/';

const routePathMatchesPatternForPageCreate = (path: string, pattern: string) => {
    const pathSegments = normalizeRoutePathForCreate(path).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const patternSegments = normalizeRoutePathForCreate(pattern).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (pathSegments.length !== patternSegments.length) return false;

    return patternSegments.every((segment, index) => segment.startsWith(':') || segment === decodeURIComponent(pathSegments[index] || ''));
};

type PageCreateCollectionRouteConflict = {
    kind: 'reserved' | 'collectionList' | 'collectionItem';
    path: string;
    title: string;
    message: string;
    collection?: Collection;
};

type PageCollectionDatasetContract = {
    schemaVersion: 'backy.collection-dataset-page.v1';
    mode: PageDatasetMode;
    collectionId: string;
    collectionSlug: string;
    collectionName: string;
    datasetId: string;
    routePattern: string;
    listRoutePattern: string;
    resolvedPath: string;
    recordParam: 'recordSlug' | null;
    slugField: string | null;
    titleField: string | null;
    descriptionField: string | null;
    imageField: string | null;
};

const findCollectionRouteConflictForPageCreate = (
    path: string,
    collections: Collection[],
): PageCreateCollectionRouteConflict | null => {
    const normalizedPath = normalizeRoutePathForCreate(path);
    const firstSegment = normalizedPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || '';
    if (firstSegment === 'api' || firstSegment === 'sites' || firstSegment === 'blog') {
        return {
            kind: 'reserved',
            path: normalizedPath,
            title: 'reserved Backy route',
            message: `The ${normalizedPath} route uses a reserved Backy route prefix.`,
        };
    }

    for (const collection of collections) {
        const listPattern = normalizeCollectionPatternForPageCreate(collection.listRoutePattern, collection.slug, `/${collection.slug}`);
        if (routePathMatchesPatternForPageCreate(normalizedPath, listPattern)) {
            return {
                kind: 'collectionList',
                path: normalizedPath,
                title: `${collection.name} collection list route`,
                message: `The ${normalizedPath} route is already reserved by the "${collection.name}" collection list route.`,
                collection,
            };
        }

        const itemPattern = normalizeCollectionPatternForPageCreate(collection.routePattern, collection.slug, `/${collection.slug}/:recordSlug`);
        if (itemPattern.split('/').includes(':recordSlug') && routePathMatchesPatternForPageCreate(normalizedPath, itemPattern)) {
            return {
                kind: 'collectionItem',
                path: normalizedPath,
                title: `${collection.name} collection item route`,
                message: `The ${normalizedPath} route is already reserved by the "${collection.name}" collection item route.`,
                collection,
            };
        }
    }

    return null;
};

const buildPageCollectionDatasetContract = (
    collection: Collection,
    mode: PageDatasetMode,
): PageCollectionDatasetContract => {
    const fields = buildPageCollectionDatasetFields(collection);
    const routePattern = normalizeCollectionDatasetItemPath(collection);
    const listRoutePattern = normalizeCollectionDatasetListPath(collection);

    return {
        schemaVersion: 'backy.collection-dataset-page.v1',
        mode,
        collectionId: collection.id,
        collectionSlug: collection.slug,
        collectionName: collection.name,
        datasetId: `dataset_${collection.id}`,
        routePattern,
        listRoutePattern,
        resolvedPath: mode === 'item' ? routePattern : listRoutePattern,
        recordParam: mode === 'item' ? 'recordSlug' : null,
        slugField: fields.titleField?.type === 'slug' ? fields.titleField.key : collection.fields.find((field) => field.type === 'slug')?.key || null,
        titleField: fields.titleField?.key || null,
        descriptionField: fields.descriptionField?.key || null,
        imageField: fields.imageField?.key || null,
    };
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

const normalizeKeywords = (value: string): string[] => (
    Array.from(new Set(value
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean)))
        .slice(0, 20)
);

const parseJsonLd = (
    value: string,
): { ok: true; value: Array<Record<string, unknown>> } | { ok: false; message: string } => {
    if (!value.trim()) {
        return { ok: true, value: [] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return { ok: false, message: 'JSON-LD must be valid JSON.' };
    }

    if (!Array.isArray(parsed)) {
        return { ok: false, message: 'JSON-LD must be a JSON array.' };
    }

    for (const [index, entry] of parsed.entries()) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            return { ok: false, message: `JSON-LD entry ${index + 1} must be an object.` };
        }
    }

    return { ok: true, value: parsed as Array<Record<string, unknown>> };
};

const getPagePublicPath = (page: Pick<Page, 'slug' | 'isHomepage'>) => (
    page.isHomepage || page.slug === 'index' || page.slug === 'home' || page.slug === ''
        ? '/'
        : `/${slugify(page.slug)}`
);

const templateNavigationItems: Record<PageTemplate, string[]> = {
    blank: ['Home', 'About', 'Contact'],
    landing: ['Home', 'Features', 'Contact'],
    storefront: ['Home', 'Shop', 'About', 'Contact'],
    'product-detail': ['Home', 'Shop', 'Product', 'Contact'],
    pricing: ['Home', 'Pricing', 'Shop', 'Contact'],
    services: ['Home', 'Services', 'Pricing', 'Contact'],
    booking: ['Home', 'Book', 'Services', 'Contact'],
    portfolio: ['Home', 'Portfolio', 'Services', 'Contact'],
    gallery: ['Home', 'Gallery', 'Collections', 'Contact'],
    events: ['Home', 'Events', 'Blog', 'Contact'],
    privacy: ['Home', 'Privacy', 'Terms', 'Contact'],
    terms: ['Home', 'Terms', 'Privacy', 'Contact'],
    'cookie-policy': ['Home', 'Cookies', 'Privacy', 'Contact'],
    'accessibility-statement': ['Home', 'Accessibility', 'Privacy', 'Contact'],
    'refund-policy': ['Home', 'Refunds', 'Terms', 'Contact'],
    'shipping-policy': ['Home', 'Shipping', 'Refunds', 'Contact'],
    cart: ['Home', 'Shop', 'Cart', 'Checkout'],
    checkout: ['Home', 'Shop', 'Checkout', 'Support'],
    'order-confirmation': ['Home', 'Shop', 'Orders', 'Support'],
    'help-center': ['Home', 'Help', 'Orders', 'Contact'],
    faq: ['Home', 'FAQ', 'Help', 'Contact'],
    testimonials: ['Home', 'Testimonials', 'Services', 'Contact'],
    'blog-index': ['Home', 'Blog', 'About', 'Contact'],
    'blog-post': ['Home', 'Blog', 'Categories', 'Contact'],
    team: ['Home', 'Team', 'About', 'Contact'],
    careers: ['Home', 'Careers', 'Team', 'Contact'],
    about: ['Home', 'About', 'Contact'],
    contact: ['Home', 'About', 'Contact'],
    newsletter: ['Home', 'Newsletter', 'Blog', 'Contact'],
    survey: ['Home', 'Survey', 'Help', 'Contact'],
    registration: ['Home', 'Register', 'Contact'],
    'member-login': ['Home', 'Login', 'Register'],
    'member-account': ['Home', 'Account', 'Support'],
};

const templatePreviewBlocks: Record<PageTemplate, TemplatePreviewBlock[]> = {
    blank: [
        { x: 12, y: 18, w: 42, h: 6, className: 'bg-slate-900' },
        { x: 12, y: 30, w: 64, h: 4, className: 'bg-slate-300' },
        { x: 12, y: 39, w: 52, h: 4, className: 'bg-slate-200' },
        { label: 'Text', x: 12, y: 55, w: 28, h: 16, className: 'border-slate-300 bg-white' },
    ],
    landing: [
        { label: 'Hero', x: 8, y: 16, w: 84, h: 34, className: 'border-teal-200 bg-teal-50' },
        { x: 14, y: 25, w: 36, h: 5, className: 'bg-teal-800' },
        { x: 14, y: 36, w: 24, h: 6, className: 'bg-emerald-500' },
        { label: 'Cards', x: 8, y: 58, w: 24, h: 20, className: 'border-slate-200 bg-white' },
        { x: 38, y: 58, w: 24, h: 20, className: 'border-slate-200 bg-white' },
        { x: 68, y: 58, w: 24, h: 20, className: 'border-slate-200 bg-white' },
    ],
    storefront: [
        { label: 'Product', x: 8, y: 16, w: 38, h: 34, className: 'border-amber-200 bg-amber-50' },
        { x: 54, y: 20, w: 30, h: 5, className: 'bg-slate-900' },
        { x: 54, y: 32, w: 24, h: 5, className: 'bg-emerald-500' },
        { label: 'Grid', x: 8, y: 58, w: 24, h: 20, className: 'border-amber-200 bg-white' },
        { x: 38, y: 58, w: 24, h: 20, className: 'border-amber-200 bg-white' },
        { x: 68, y: 58, w: 24, h: 20, className: 'border-amber-200 bg-white' },
    ],
    'product-detail': [
        { label: 'Media', x: 8, y: 16, w: 42, h: 42, className: 'border-orange-200 bg-orange-50' },
        { label: 'Product', x: 56, y: 16, w: 36, h: 42, className: 'border-slate-200 bg-white' },
        { x: 62, y: 25, w: 24, h: 5, className: 'bg-slate-900' },
        { x: 62, y: 38, w: 14, h: 5, className: 'bg-emerald-600' },
        { x: 62, y: 49, w: 20, h: 7, className: 'bg-orange-600' },
        { label: 'Related', x: 8, y: 66, w: 24, h: 12, className: 'border-orange-100 bg-white' },
        { x: 38, y: 66, w: 24, h: 12, className: 'border-orange-100 bg-white' },
        { x: 68, y: 66, w: 24, h: 12, className: 'border-orange-100 bg-white' },
    ],
    pricing: [
        { label: 'Plans', x: 8, y: 14, w: 84, h: 24, className: 'border-violet-200 bg-violet-50' },
        { x: 18, y: 24, w: 34, h: 5, className: 'bg-violet-800' },
        { label: 'Basic', x: 8, y: 48, w: 24, h: 28, className: 'border-violet-100 bg-white' },
        { label: 'Pro', x: 38, y: 44, w: 24, h: 34, className: 'border-violet-200 bg-white' },
        { label: 'Team', x: 68, y: 48, w: 24, h: 28, className: 'border-violet-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    services: [
        { label: 'Services', x: 8, y: 14, w: 84, h: 24, className: 'border-rose-200 bg-rose-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-rose-800' },
        { label: 'Filters', x: 62, y: 24, w: 22, h: 6, className: 'border-rose-100 bg-white' },
        { label: 'Consult', x: 8, y: 48, w: 26, h: 28, className: 'border-rose-100 bg-white' },
        { label: 'Build', x: 38, y: 48, w: 26, h: 28, className: 'border-rose-100 bg-white' },
        { label: 'Care', x: 68, y: 48, w: 24, h: 28, className: 'border-rose-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    booking: [
        { label: 'Booking', x: 8, y: 14, w: 84, h: 24, className: 'border-teal-200 bg-teal-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-teal-800' },
        { label: 'Calendar', x: 64, y: 24, w: 20, h: 6, className: 'border-teal-100 bg-white' },
        { label: 'Intro', x: 8, y: 48, w: 26, h: 26, className: 'border-teal-100 bg-white' },
        { label: 'Session', x: 38, y: 48, w: 26, h: 26, className: 'border-teal-100 bg-white' },
        { label: 'Confirm', x: 68, y: 48, w: 24, h: 26, className: 'border-teal-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    portfolio: [
        { label: 'Work', x: 8, y: 14, w: 84, h: 24, className: 'border-cyan-200 bg-cyan-50' },
        { x: 16, y: 24, w: 38, h: 5, className: 'bg-cyan-800' },
        { label: 'Filter', x: 62, y: 24, w: 22, h: 6, className: 'border-cyan-100 bg-white' },
        { label: 'Case', x: 8, y: 48, w: 26, h: 28, className: 'border-cyan-100 bg-white' },
        { label: 'Media', x: 38, y: 48, w: 26, h: 28, className: 'border-cyan-100 bg-white' },
        { label: 'Launch', x: 68, y: 48, w: 24, h: 28, className: 'border-cyan-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    gallery: [
        { label: 'Gallery', x: 8, y: 14, w: 84, h: 24, className: 'border-blue-200 bg-blue-50' },
        { x: 16, y: 24, w: 38, h: 5, className: 'bg-blue-800' },
        { label: 'Folders', x: 62, y: 24, w: 22, h: 6, className: 'border-blue-100 bg-white' },
        { label: 'Image', x: 8, y: 48, w: 24, h: 18, className: 'border-blue-100 bg-white' },
        { label: 'Video', x: 36, y: 48, w: 24, h: 18, className: 'border-blue-100 bg-white' },
        { label: 'File', x: 64, y: 48, w: 28, h: 18, className: 'border-blue-100 bg-white' },
        { label: 'Lightbox', x: 8, y: 76, w: 84, h: 12, className: 'border-slate-200 bg-white' },
    ],
    events: [
        { label: 'Events', x: 8, y: 14, w: 84, h: 24, className: 'border-lime-200 bg-lime-50' },
        { x: 16, y: 24, w: 38, h: 5, className: 'bg-lime-800' },
        { label: 'Format', x: 62, y: 24, w: 22, h: 6, className: 'border-lime-100 bg-white' },
        { label: 'Webinar', x: 8, y: 48, w: 26, h: 28, className: 'border-lime-100 bg-white' },
        { label: 'Meetup', x: 38, y: 48, w: 26, h: 28, className: 'border-lime-100 bg-white' },
        { label: 'RSVP', x: 68, y: 48, w: 24, h: 28, className: 'border-lime-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    privacy: [
        { label: 'Policy', x: 8, y: 14, w: 84, h: 24, className: 'border-slate-300 bg-slate-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-slate-900' },
        { label: 'Rights', x: 64, y: 24, w: 20, h: 6, className: 'border-slate-200 bg-white' },
        { label: 'Data', x: 8, y: 48, w: 26, h: 28, className: 'border-slate-200 bg-white' },
        { label: 'Use', x: 38, y: 48, w: 26, h: 28, className: 'border-slate-200 bg-white' },
        { label: 'Contact', x: 68, y: 48, w: 24, h: 28, className: 'border-slate-200 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    terms: [
        { label: 'Terms', x: 8, y: 14, w: 84, h: 24, className: 'border-zinc-300 bg-zinc-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-zinc-900' },
        { label: 'Rules', x: 64, y: 24, w: 20, h: 6, className: 'border-zinc-200 bg-white' },
        { label: 'Use', x: 8, y: 48, w: 26, h: 28, className: 'border-zinc-200 bg-white' },
        { label: 'Sales', x: 38, y: 48, w: 26, h: 28, className: 'border-zinc-200 bg-white' },
        { label: 'Support', x: 68, y: 48, w: 24, h: 28, className: 'border-zinc-200 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-zinc-200 bg-white' },
    ],
    'cookie-policy': [
        { label: 'Cookies', x: 8, y: 14, w: 84, h: 24, className: 'border-fuchsia-200 bg-fuchsia-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-fuchsia-800' },
        { label: 'Consent', x: 64, y: 24, w: 20, h: 6, className: 'border-fuchsia-100 bg-white' },
        { label: 'Essential', x: 8, y: 48, w: 26, h: 28, className: 'border-fuchsia-100 bg-white' },
        { label: 'Analytics', x: 38, y: 48, w: 26, h: 28, className: 'border-fuchsia-100 bg-white' },
        { label: 'Prefs', x: 68, y: 48, w: 24, h: 28, className: 'border-fuchsia-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    'accessibility-statement': [
        { label: 'Access', x: 8, y: 14, w: 84, h: 24, className: 'border-indigo-200 bg-indigo-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-indigo-800' },
        { label: 'WCAG', x: 64, y: 24, w: 20, h: 6, className: 'border-indigo-100 bg-white' },
        { label: 'Keyboard', x: 8, y: 48, w: 26, h: 28, className: 'border-indigo-100 bg-white' },
        { label: 'Assistive', x: 38, y: 48, w: 26, h: 28, className: 'border-indigo-100 bg-white' },
        { label: 'Feedback', x: 68, y: 48, w: 24, h: 28, className: 'border-indigo-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    'refund-policy': [
        { label: 'Refunds', x: 8, y: 14, w: 84, h: 24, className: 'border-emerald-200 bg-emerald-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-emerald-800' },
        { label: 'Window', x: 64, y: 24, w: 20, h: 6, className: 'border-emerald-100 bg-white' },
        { label: 'Returns', x: 8, y: 48, w: 26, h: 28, className: 'border-emerald-100 bg-white' },
        { label: 'Exchanges', x: 38, y: 48, w: 26, h: 28, className: 'border-emerald-100 bg-white' },
        { label: 'Support', x: 68, y: 48, w: 24, h: 28, className: 'border-emerald-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    'shipping-policy': [
        { label: 'Shipping', x: 8, y: 14, w: 84, h: 24, className: 'border-sky-200 bg-sky-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-sky-800' },
        { label: 'ETA', x: 64, y: 24, w: 20, h: 6, className: 'border-sky-100 bg-white' },
        { label: 'Standard', x: 8, y: 48, w: 26, h: 28, className: 'border-sky-100 bg-white' },
        { label: 'Express', x: 38, y: 48, w: 26, h: 28, className: 'border-sky-100 bg-white' },
        { label: 'Tracking', x: 68, y: 48, w: 24, h: 28, className: 'border-sky-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    cart: [
        { label: 'Cart', x: 8, y: 14, w: 52, h: 20, className: 'border-teal-200 bg-teal-50' },
        { x: 14, y: 23, w: 34, h: 5, className: 'bg-teal-800' },
        { label: 'Items', x: 8, y: 42, w: 50, h: 10, className: 'border-slate-200 bg-white' },
        { x: 8, y: 56, w: 50, h: 10, className: 'border-slate-200 bg-white' },
        { x: 8, y: 70, w: 50, h: 10, className: 'border-slate-200 bg-white' },
        { label: 'Totals', x: 64, y: 42, w: 28, h: 38, className: 'border-teal-100 bg-white' },
        { x: 70, y: 68, w: 16, h: 6, className: 'bg-teal-600' },
    ],
    checkout: [
        { label: 'Checkout', x: 8, y: 14, w: 46, h: 26, className: 'border-emerald-200 bg-emerald-50' },
        { x: 14, y: 23, w: 30, h: 5, className: 'bg-emerald-800' },
        { label: 'Summary', x: 60, y: 14, w: 32, h: 34, className: 'border-slate-200 bg-white' },
        { x: 66, y: 25, w: 18, h: 4, className: 'bg-slate-300' },
        { x: 66, y: 36, w: 20, h: 5, className: 'bg-slate-900' },
        { label: 'Customer', x: 8, y: 56, w: 38, h: 22, className: 'border-emerald-100 bg-white' },
        { label: 'Payment', x: 54, y: 56, w: 38, h: 22, className: 'border-emerald-100 bg-white' },
    ],
    'order-confirmation': [
        { label: 'Success', x: 8, y: 14, w: 46, h: 24, className: 'border-green-200 bg-green-50' },
        { x: 16, y: 24, w: 24, h: 5, className: 'bg-green-700' },
        { label: 'Receipt', x: 60, y: 14, w: 32, h: 38, className: 'border-slate-200 bg-white' },
        { x: 66, y: 25, w: 18, h: 4, className: 'bg-slate-300' },
        { x: 66, y: 38, w: 18, h: 5, className: 'bg-slate-900' },
        { label: 'Next', x: 8, y: 60, w: 24, h: 18, className: 'border-green-100 bg-white' },
        { x: 38, y: 60, w: 24, h: 18, className: 'border-green-100 bg-white' },
        { x: 68, y: 60, w: 24, h: 18, className: 'border-green-100 bg-white' },
    ],
    'help-center': [
        { label: 'Search', x: 8, y: 14, w: 84, h: 26, className: 'border-sky-200 bg-sky-50' },
        { x: 18, y: 25, w: 52, h: 5, className: 'bg-sky-800' },
        { label: 'Topics', x: 8, y: 50, w: 24, h: 20, className: 'border-sky-100 bg-white' },
        { x: 38, y: 50, w: 24, h: 20, className: 'border-sky-100 bg-white' },
        { x: 68, y: 50, w: 24, h: 20, className: 'border-sky-100 bg-white' },
        { label: 'FAQ', x: 8, y: 76, w: 84, h: 8, className: 'border-slate-200 bg-white' },
    ],
    faq: [
        { label: 'FAQ', x: 8, y: 14, w: 84, h: 24, className: 'border-blue-200 bg-blue-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-blue-800' },
        { label: 'Search', x: 64, y: 24, w: 20, h: 6, className: 'border-blue-100 bg-white' },
        { label: 'Question', x: 8, y: 48, w: 56, h: 8, className: 'border-blue-100 bg-white' },
        { x: 8, y: 60, w: 56, h: 8, className: 'border-blue-100 bg-white' },
        { x: 8, y: 72, w: 56, h: 8, className: 'border-blue-100 bg-white' },
        { label: 'Contact', x: 70, y: 48, w: 22, h: 32, className: 'border-slate-200 bg-white' },
    ],
    testimonials: [
        { label: 'Proof', x: 8, y: 14, w: 84, h: 24, className: 'border-amber-200 bg-amber-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-amber-800' },
        { label: 'Rating', x: 64, y: 24, w: 20, h: 6, className: 'border-amber-100 bg-white' },
        { label: 'Quote', x: 8, y: 48, w: 26, h: 28, className: 'border-amber-100 bg-white' },
        { label: 'Quote', x: 38, y: 48, w: 26, h: 28, className: 'border-amber-100 bg-white' },
        { label: 'Quote', x: 68, y: 48, w: 24, h: 28, className: 'border-amber-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    'blog-index': [
        { label: 'Feature', x: 8, y: 16, w: 84, h: 28, className: 'border-indigo-200 bg-indigo-50' },
        { x: 14, y: 25, w: 32, h: 5, className: 'bg-indigo-800' },
        { label: 'Posts', x: 8, y: 54, w: 84, h: 7, className: 'border-slate-200 bg-white' },
        { x: 8, y: 65, w: 84, h: 7, className: 'border-slate-200 bg-white' },
        { x: 8, y: 76, w: 84, h: 7, className: 'border-slate-200 bg-white' },
    ],
    'blog-post': [
        { label: 'Article', x: 8, y: 14, w: 84, h: 30, className: 'border-indigo-200 bg-indigo-50' },
        { x: 16, y: 24, w: 46, h: 5, className: 'bg-indigo-800' },
        { x: 16, y: 34, w: 30, h: 4, className: 'bg-indigo-300' },
        { label: 'Body', x: 8, y: 52, w: 54, h: 34, className: 'border-slate-200 bg-white' },
        { x: 16, y: 62, w: 38, h: 3, className: 'bg-slate-200' },
        { x: 16, y: 70, w: 32, h: 3, className: 'bg-slate-200' },
        { label: 'Author', x: 68, y: 52, w: 24, h: 18, className: 'border-indigo-100 bg-white' },
        { x: 68, y: 78, w: 24, h: 8, className: 'border-slate-200 bg-white' },
    ],
    team: [
        { label: 'Team', x: 8, y: 14, w: 84, h: 24, className: 'border-pink-200 bg-pink-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-pink-800' },
        { label: 'Roles', x: 64, y: 24, w: 20, h: 6, className: 'border-pink-100 bg-white' },
        { label: 'Lead', x: 8, y: 48, w: 26, h: 28, className: 'border-pink-100 bg-white' },
        { label: 'Design', x: 38, y: 48, w: 26, h: 28, className: 'border-pink-100 bg-white' },
        { label: 'Careers', x: 68, y: 48, w: 24, h: 28, className: 'border-pink-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    careers: [
        { label: 'Careers', x: 8, y: 14, w: 84, h: 24, className: 'border-emerald-200 bg-emerald-50' },
        { x: 16, y: 24, w: 42, h: 5, className: 'bg-emerald-800' },
        { label: 'Filters', x: 64, y: 24, w: 20, h: 6, className: 'border-emerald-100 bg-white' },
        { label: 'Role', x: 8, y: 48, w: 26, h: 24, className: 'border-emerald-100 bg-white' },
        { label: 'Role', x: 38, y: 48, w: 26, h: 24, className: 'border-emerald-100 bg-white' },
        { label: 'Apply', x: 68, y: 48, w: 24, h: 24, className: 'border-emerald-100 bg-white' },
        { x: 8, y: 82, w: 84, h: 8, className: 'border-slate-200 bg-white' },
    ],
    about: [
        { label: 'Story', x: 8, y: 16, w: 42, h: 30, className: 'border-cyan-200 bg-cyan-50' },
        { x: 58, y: 20, w: 28, h: 5, className: 'bg-slate-900' },
        { x: 58, y: 32, w: 28, h: 4, className: 'bg-slate-300' },
        { label: 'Values', x: 8, y: 56, w: 26, h: 19, className: 'border-cyan-200 bg-white' },
        { x: 38, y: 56, w: 26, h: 19, className: 'border-cyan-200 bg-white' },
        { x: 68, y: 56, w: 24, h: 19, className: 'border-cyan-200 bg-white' },
    ],
    contact: [
        { x: 8, y: 18, w: 30, h: 5, className: 'bg-slate-900' },
        { x: 8, y: 30, w: 28, h: 4, className: 'bg-slate-300' },
        { label: 'Form', x: 48, y: 16, w: 44, h: 62, className: 'border-emerald-200 bg-emerald-50' },
        { x: 54, y: 28, w: 32, h: 6, className: 'bg-white' },
        { x: 54, y: 40, w: 32, h: 6, className: 'bg-white' },
        { x: 54, y: 58, w: 20, h: 7, className: 'bg-emerald-600' },
    ],
    newsletter: [
        { label: 'Subscribe', x: 8, y: 14, w: 84, h: 28, className: 'border-amber-200 bg-amber-50' },
        { x: 16, y: 25, w: 38, h: 5, className: 'bg-amber-800' },
        { label: 'Email', x: 56, y: 24, w: 28, h: 6, className: 'border-amber-100 bg-white' },
        { label: 'Topics', x: 8, y: 52, w: 26, h: 22, className: 'border-amber-100 bg-white' },
        { label: 'Consent', x: 38, y: 52, w: 26, h: 22, className: 'border-amber-100 bg-white' },
        { label: 'Confirm', x: 68, y: 52, w: 24, h: 22, className: 'border-amber-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    survey: [
        { label: 'Survey', x: 8, y: 14, w: 84, h: 28, className: 'border-purple-200 bg-purple-50' },
        { x: 16, y: 25, w: 38, h: 5, className: 'bg-purple-800' },
        { label: 'Rating', x: 56, y: 24, w: 28, h: 6, className: 'border-purple-100 bg-white' },
        { label: 'Question', x: 8, y: 52, w: 26, h: 22, className: 'border-purple-100 bg-white' },
        { label: 'Choice', x: 38, y: 52, w: 26, h: 22, className: 'border-purple-100 bg-white' },
        { label: 'Notes', x: 68, y: 52, w: 24, h: 22, className: 'border-purple-100 bg-white' },
        { x: 8, y: 84, w: 84, h: 6, className: 'border-slate-200 bg-white' },
    ],
    registration: [
        { label: 'Signup', x: 8, y: 16, w: 40, h: 34, className: 'border-violet-200 bg-violet-50' },
        { x: 14, y: 27, w: 26, h: 5, className: 'bg-violet-800' },
        { label: 'Fields', x: 56, y: 16, w: 36, h: 60, className: 'border-slate-200 bg-white' },
        { x: 62, y: 28, w: 24, h: 6, className: 'bg-slate-100' },
        { x: 62, y: 40, w: 24, h: 6, className: 'bg-slate-100' },
        { x: 62, y: 58, w: 18, h: 7, className: 'bg-violet-600' },
    ],
    'member-login': [
        { label: 'Access', x: 8, y: 16, w: 42, h: 34, className: 'border-sky-200 bg-sky-50' },
        { x: 14, y: 27, w: 28, h: 5, className: 'bg-sky-800' },
        { label: 'Email', x: 56, y: 18, w: 36, h: 42, className: 'border-slate-200 bg-white' },
        { x: 62, y: 30, w: 24, h: 6, className: 'bg-slate-100' },
        { x: 62, y: 45, w: 18, h: 7, className: 'bg-sky-600' },
        { label: 'Register', x: 56, y: 68, w: 36, h: 10, className: 'border-sky-100 bg-sky-50' },
    ],
    'member-account': [
        { label: 'Profile', x: 8, y: 14, w: 38, h: 26, className: 'border-emerald-200 bg-emerald-50' },
        { x: 14, y: 24, w: 25, h: 5, className: 'bg-emerald-800' },
        { label: 'Prefs', x: 56, y: 14, w: 36, h: 42, className: 'border-slate-200 bg-white' },
        { x: 62, y: 27, w: 24, h: 6, className: 'bg-slate-100' },
        { x: 62, y: 43, w: 18, h: 7, className: 'bg-emerald-600' },
        { label: 'Cards', x: 8, y: 64, w: 24, h: 14, className: 'border-emerald-100 bg-white' },
        { x: 38, y: 64, w: 24, h: 14, className: 'border-emerald-100 bg-white' },
    ],
};

const isPageTemplate = (value: unknown): value is PageTemplate => (
    typeof value === 'string' && TEMPLATE_OPTIONS.some((template) => template.id === value)
);

const isPageCreationStatus = (value: unknown): value is PageCreationStatus => (
    value === 'draft' || value === 'published' || value === 'scheduled'
);

const isPageNavigationPlacement = (value: unknown): value is PageNavigationPlacement => (
    value === 'none' || value === 'primary' || value === 'footer'
);

const isPageDatasetMode = (value: unknown): value is PageDatasetMode => (
    value === 'list' || value === 'item'
);

const normalizedSearchString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const normalizedSearchBoolean = (value: unknown): boolean | undefined => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
};

const normalizedSearchJsonLd = (value: unknown): string | undefined => {
    const stringValue = normalizedSearchString(value);
    if (stringValue) return stringValue;

    if ((Array.isArray(value) || (typeof value === 'object' && value !== null))) {
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return undefined;
        }
    }

    return undefined;
};

const getScheduledPageDateError = (status: PageCreationStatus, scheduledAt: string | null): string | null => {
    if (status !== 'scheduled') return null;
    if (!scheduledAt) return 'Choose a publish date before creating a scheduled page.';

    const scheduledAtMs = Date.parse(scheduledAt);
    if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
        return 'Choose a future publish date before creating a scheduled page.';
    }

    return null;
};

const normalizeNewPageSearch = (input: NewPageSearch): NewPageSearch => ({
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.template && input.template !== 'blank' ? { template: input.template } : {}),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.slug?.trim() ? { slug: input.slug.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.status && input.status !== 'draft' ? { status: input.status } : {}),
    ...(input.scheduledAt && input.status === 'scheduled' ? { scheduledAt: input.scheduledAt } : {}),
    ...(input.isHomepage ? { isHomepage: true } : {}),
    ...(input.nav && input.nav !== DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[input.template || 'blank'] ? { nav: input.nav } : {}),
    ...(input.navLabel?.trim() ? { navLabel: input.navLabel.trim() } : {}),
    ...(input.parentPageId?.trim() ? { parentPageId: input.parentPageId.trim() } : {}),
    ...(input.seoTitle?.trim() ? { seoTitle: input.seoTitle.trim() } : {}),
    ...(input.canonical?.trim() ? { canonical: input.canonical.trim() } : {}),
    ...(input.keywords?.trim() ? { keywords: input.keywords.trim() } : {}),
    ...(input.jsonLd?.trim() ? { jsonLd: input.jsonLd.trim() } : {}),
    ...(input.ogImage?.trim() ? { ogImage: input.ogImage.trim() } : {}),
    ...(input.noIndex ? { noIndex: true } : {}),
    ...(input.noFollow ? { noFollow: true } : {}),
    ...(input.designTemplate?.trim() ? { designTemplate: input.designTemplate.trim() } : {}),
    ...(input.collectionId?.trim() ? { collectionId: input.collectionId.trim() } : {}),
    ...(input.datasetMode ? { datasetMode: input.datasetMode } : {}),
});

export const Route = createFileRoute('/pages/new')({
    validateSearch: (search: Record<string, unknown>): NewPageSearch => ({
        siteId: normalizedSearchString(search.siteId),
        template: isPageTemplate(search.template) ? search.template : undefined,
        title: normalizedSearchString(search.title),
        slug: normalizedSearchString(search.slug),
        description: normalizedSearchString(search.description),
        status: isPageCreationStatus(search.status) ? search.status : undefined,
        scheduledAt: normalizedSearchString(search.scheduledAt),
        isHomepage: normalizedSearchBoolean(search.isHomepage),
        nav: isPageNavigationPlacement(search.nav) ? search.nav : undefined,
        navLabel: normalizedSearchString(search.navLabel),
        parentPageId: normalizedSearchString(search.parentPageId),
        seoTitle: normalizedSearchString(search.seoTitle),
        canonical: normalizedSearchString(search.canonical),
        keywords: normalizedSearchString(search.keywords),
        jsonLd: normalizedSearchJsonLd(search.jsonLd),
        ogImage: normalizedSearchString(search.ogImage),
        noIndex: normalizedSearchBoolean(search.noIndex),
        noFollow: normalizedSearchBoolean(search.noFollow),
        designTemplate: normalizedSearchString(search.designTemplate),
        collectionId: normalizedSearchString(search.collectionId),
        datasetMode: isPageDatasetMode(search.datasetMode) ? search.datasetMode : undefined,
    }),
    component: NewPageRoute,
});

function NewPageRoute() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const currentAdmin = useAuthStore((state) => state.user);
    const { sites, pages, setPages } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingPages, setIsCheckingPages] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [routeCheckError, setRouteCheckError] = useState<string | null>(null);
    const [routeCheckRetry, setRouteCheckRetry] = useState(0);
    const [hasHydratedAutosave, setHasHydratedAutosave] = useState(false);
    const [draftRecovery, setDraftRecovery] = useState<PageCreateAutosaveDraft | null>(null);
    const [autosavePausedForRecovery, setAutosavePausedForRecovery] = useState(false);
    const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState('Autosave ready');
    const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
    const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
    const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [collectionsLoading, setCollectionsLoading] = useState(false);
    const [collectionsError, setCollectionsError] = useState<string | null>(null);
    const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
    const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
    const canViewPages = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canEditPages = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canPublishPages = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canViewCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canViewSites = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'sites.view', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canConfigureSites = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'sites.configure', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canCreateSites = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'sites.create', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewPermissionTitle = canViewPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.view', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const editPermissionTitle = canEditPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const publishPermissionTitle = canPublishPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.publish', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const collectionsViewPermissionTitle = canViewCollections ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'collections.view', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const sitesViewPermissionTitle = canViewSites ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'sites.view', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const sitesConfigurePermissionTitle = canConfigureSites ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'sites.configure', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const sitesCreatePermissionTitle = canCreateSites ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'sites.create', PAGE_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canApplyNavigationPlacement = canViewSites && canConfigureSites;
    const isPageCreateBusy = isLoading || isCheckingPages || isPermissionMatrixPending;
    const defaultSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
    const requestedSite = search.siteId
        ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
        : undefined;
    const requestedSiteId = requestedSite?.publicSiteId || requestedSite?.id || search.siteId || defaultSiteId;
    const initialTemplate = search.template || 'blank';
    const templateDefaults = TEMPLATE_DEFAULTS[initialTemplate];

    // Default to first site if available
    const [formData, setFormData] = useState<PageCreateDraftState>({
        title: search.title ?? templateDefaults.title,
        slug: search.isHomepage ? 'index' : search.slug ?? templateDefaults.slug,
        siteId: requestedSiteId,
        template: initialTemplate,
        status: search.status || ('draft' as PageCreationStatus),
        scheduledAt: search.status === 'scheduled' ? search.scheduledAt ?? null : null,
        isHomepage: search.isHomepage ?? false,
        description: search.description ?? templateDefaults.description,
        parentPageId: search.parentPageId ?? '',
        navigationPlacement: search.nav || DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[initialTemplate],
        navigationLabel: search.navLabel ?? search.title ?? templateDefaults.title,
        seoTitle: search.seoTitle ?? search.title ?? templateDefaults.title,
        canonicalPath: search.canonical ?? '',
        keywords: search.keywords ?? '',
        jsonLdText: search.jsonLd ?? '',
        ogImage: search.ogImage ?? '',
        noIndex: search.noIndex ?? false,
        noFollow: search.noFollow ?? false,
        designTemplateId: search.designTemplate ?? '',
        collectionId: search.collectionId ?? '',
        datasetMode: search.datasetMode ?? '',
    });
    const selectedSite = sites.find((site) => siteMatchesIdentifier(site, formData.siteId));
    const buildRouteSearchFromForm = (nextFormData: typeof formData): NewPageSearch => normalizeNewPageSearch({
        siteId: nextFormData.siteId,
        template: nextFormData.template,
        title: nextFormData.title,
        slug: nextFormData.slug,
        description: nextFormData.description,
        status: nextFormData.status,
        scheduledAt: nextFormData.scheduledAt || undefined,
        isHomepage: nextFormData.isHomepage,
        parentPageId: nextFormData.parentPageId,
        nav: nextFormData.navigationPlacement,
        navLabel: nextFormData.navigationLabel,
        seoTitle: nextFormData.seoTitle,
        canonical: nextFormData.canonicalPath,
        keywords: nextFormData.keywords,
        jsonLd: nextFormData.jsonLdText,
        ogImage: nextFormData.ogImage,
        noIndex: nextFormData.noIndex,
        noFollow: nextFormData.noFollow,
        designTemplate: nextFormData.designTemplateId,
        collectionId: nextFormData.collectionId,
        datasetMode: nextFormData.datasetMode || undefined,
    });
    const updatePageDraft = (next: Partial<typeof formData>) => {
        if (isPageCreateBusy || !canEditPages) return;

        const nextFormData = {
            ...formData,
            ...next,
        };

        setFormData(nextFormData);
        setError(null);
        setNotice(null);
        navigate({ to: '/pages/new', search: buildRouteSearchFromForm(nextFormData), replace: true });
    };

    useEffect(() => {
        let cancelled = false;
        setPermissionError(null);

        if (!currentAdmin?.id) {
            setPermissionMatrix(null);
            setIsPermissionsLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setIsPermissionsLoading(true);
        getUserPermissions(currentAdmin.id)
            .then((matrix) => {
                if (!cancelled) {
                    setPermissionMatrix(matrix);
                    setPermissionError(null);
                }
            })
            .catch((permissionLoadError) => {
                if (!cancelled) {
                    setPermissionMatrix(null);
                    setPermissionError(permissionLoadError instanceof Error ? permissionLoadError.message : 'Unable to load page permissions.');
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
    }, [currentAdmin?.id]);

    useEffect(() => {
        try {
            const storedDraft = window.localStorage.getItem(PAGE_CREATE_AUTOSAVE_KEY);
            if (storedDraft) {
                const parsedDraft = JSON.parse(storedDraft) as Partial<PageCreateAutosaveDraft>;
                if (isRecoverablePageCreateDraft(parsedDraft)) {
                    setDraftRecovery(parsedDraft);
                    setAutosavePausedForRecovery(true);
                    setAutosaveStatus('Recovered draft available');
                    setLastAutosavedAt(parsedDraft.savedAt);
                } else {
                    window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
                }
            }
        } catch {
            window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
        } finally {
            setHasHydratedAutosave(true);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const siteId = formData.siteId;

        if (!siteId) return;
        if (isPermissionMatrixPending) return;
        if (!canViewPages) {
            setRouteCheckError(null);
            setIsCheckingPages(false);
            return;
        }

        const loadSelectedSitePages = async () => {
            setIsCheckingPages(true);
            setRouteCheckError(null);

            try {
                const backendPages = await listPages(siteId);
                if (!cancelled) {
                    const siteIdentifiers = new Set(
                        [siteId, selectedSite?.id, selectedSite?.publicSiteId].filter((value): value is string => Boolean(value)),
                    );
                    const otherPages = pages.filter((page) => !siteIdentifiers.has(page.siteId));
                    setPages([...backendPages, ...otherPages]);
                    setError(null);
                    setRouteCheckError(null);
                }
            } catch (loadError) {
                if (!cancelled) {
                    const message = isAdminPermissionDeniedError(loadError)
                        ? viewPermissionTitle || 'Your account cannot view pages for route checks.'
                        : loadError instanceof Error ? loadError.message : 'Unable to check existing pages for this site';
                    setRouteCheckError(message);
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsCheckingPages(false);
                }
            }
        };

        void loadSelectedSitePages();

        return () => {
            cancelled = true;
        };
    }, [canViewPages, formData.siteId, isPermissionMatrixPending, routeCheckRetry, selectedSite?.id, selectedSite?.publicSiteId, setPages, viewPermissionTitle]);

    useEffect(() => {
        let cancelled = false;
        const siteId = formData.siteId;

        if (!siteId) return;
        if (isPermissionMatrixPending) return;
        if (!canViewSites) {
            setFrontendDesign(null);
            setFrontendDesignError(sitesViewPermissionTitle || 'Your account cannot view frontend design templates.');
            setFrontendDesignLoading(false);
            return;
        }

        const loadFrontendDesignTemplates = async () => {
            setFrontendDesignLoading(true);
            setFrontendDesignError(null);

            try {
                const response = await getSiteFrontendDesign(siteId);
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
    }, [canViewSites, formData.siteId, isPermissionMatrixPending, sitesViewPermissionTitle]);

    useEffect(() => {
        let cancelled = false;
        const siteId = formData.siteId;

        if (!siteId) {
            setCollections([]);
            setCollectionsError(null);
            setCollectionsLoading(false);
            return;
        }
        if (isPermissionMatrixPending) return;
        if (!canViewCollections) {
            setCollections([]);
            setCollectionsError(collectionsViewPermissionTitle || 'Your account cannot view collections for dataset page creation.');
            setCollectionsLoading(false);
            return;
        }

        const loadPageDatasetCollections = async () => {
            setCollectionsLoading(true);
            setCollectionsError(null);

            try {
                const nextCollections = await listCollections(siteId);
                if (!cancelled) {
                    setCollections(nextCollections);
                    setCollectionsError(null);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setCollections([]);
                    setCollectionsError(loadError instanceof Error ? loadError.message : 'Unable to load collections for dataset import.');
                }
            } finally {
                if (!cancelled) {
                    setCollectionsLoading(false);
                }
            }
        };

        void loadPageDatasetCollections();

        return () => {
            cancelled = true;
        };
    }, [canViewCollections, collectionsViewPermissionTitle, formData.siteId, isPermissionMatrixPending]);

    useEffect(() => {
        if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, formData.siteId))) {
            const fallbackSiteId = sites[0].publicSiteId || sites[0].id;
            const nextFormData = { ...formData, siteId: fallbackSiteId };
            setFormData(nextFormData);
            navigate({ to: '/pages/new', search: buildRouteSearchFromForm(nextFormData), replace: true });
        }
    }, [formData, navigate, sites]);

    useEffect(() => {
        const nextRequestedSite = search.siteId
            ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
            : undefined;
        const nextSiteId = nextRequestedSite?.publicSiteId || nextRequestedSite?.id || search.siteId || defaultSiteId;
        const nextTemplate = search.template || 'blank';
        const nextDefaults = TEMPLATE_DEFAULTS[nextTemplate];
        const nextFormData: PageCreateDraftState = {
            siteId: nextSiteId,
            template: nextTemplate,
            title: search.title ?? nextDefaults.title,
            slug: search.isHomepage ? 'index' : search.slug ?? nextDefaults.slug,
            description: search.description ?? nextDefaults.description,
            status: search.status || ('draft' as PageCreationStatus),
            scheduledAt: search.status === 'scheduled' ? search.scheduledAt ?? null : null,
            isHomepage: search.isHomepage ?? false,
            parentPageId: search.parentPageId ?? '',
            navigationPlacement: search.nav || DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[nextTemplate],
            navigationLabel: search.navLabel ?? search.title ?? nextDefaults.title,
            seoTitle: search.seoTitle ?? search.title ?? nextDefaults.title,
            canonicalPath: search.canonical ?? '',
            keywords: search.keywords ?? '',
            jsonLdText: search.jsonLd ?? '',
            ogImage: search.ogImage ?? '',
            noIndex: search.noIndex ?? false,
            noFollow: search.noFollow ?? false,
            designTemplateId: search.designTemplate ?? '',
            collectionId: search.collectionId ?? '',
            datasetMode: search.datasetMode || '',
        };
        setFormData((current) => {
            const hasChanged = (
                nextFormData.siteId !== current.siteId
                || nextFormData.template !== current.template
                || nextFormData.title !== current.title
                || nextFormData.slug !== current.slug
                || nextFormData.description !== current.description
                || nextFormData.status !== current.status
                || nextFormData.scheduledAt !== current.scheduledAt
                || nextFormData.isHomepage !== current.isHomepage
                || nextFormData.parentPageId !== current.parentPageId
                || nextFormData.navigationPlacement !== current.navigationPlacement
                || nextFormData.navigationLabel !== current.navigationLabel
                || nextFormData.seoTitle !== current.seoTitle
                || nextFormData.canonicalPath !== current.canonicalPath
                || nextFormData.keywords !== current.keywords
                || nextFormData.jsonLdText !== current.jsonLdText
                || nextFormData.ogImage !== current.ogImage
                || nextFormData.noIndex !== current.noIndex
                || nextFormData.noFollow !== current.noFollow
                || nextFormData.designTemplateId !== current.designTemplateId
                || nextFormData.collectionId !== current.collectionId
                || nextFormData.datasetMode !== current.datasetMode
            );

            return hasChanged ? nextFormData : current;
        });
        setError(null);
        setNotice(null);
    }, [
        defaultSiteId,
        search.description,
        search.isHomepage,
        search.scheduledAt,
        search.siteId,
        search.slug,
        search.status,
        search.template,
        search.title,
        search.nav,
        search.navLabel,
        search.parentPageId,
        search.seoTitle,
        search.canonical,
        search.keywords,
        search.jsonLd,
        search.ogImage,
        search.noIndex,
        search.noFollow,
        search.designTemplate,
        search.collectionId,
        search.datasetMode,
        sites,
    ]);

    const selectPageSite = (nextSiteId: string) => {
        if (isPageCreateBusy) return;
        updatePageDraft({
            siteId: nextSiteId,
            parentPageId: '',
            collectionId: '',
            datasetMode: '',
        });
    };
    const selectedTemplate = useMemo(
        () => TEMPLATE_OPTIONS.find((template) => template.id === formData.template) || TEMPLATE_OPTIONS[0],
        [formData.template],
    );
    const frontendPageTemplates = useMemo(
        () => (frontendDesign?.templates || []).filter((template) => template.type === 'page'),
        [frontendDesign?.templates],
    );
    const selectedFrontendTemplate = useMemo(
        () => frontendPageTemplates.find((template) => template.id === formData.designTemplateId) || null,
        [formData.designTemplateId, frontendPageTemplates],
    );
    const selectedDatasetCollection = useMemo(
        () => collections.find((collection) => (
            collection.id === formData.collectionId ||
            collection.slug === formData.collectionId
        )) || null,
        [collections, formData.collectionId],
    );
    const selectedDatasetMode = formData.datasetMode || (selectedDatasetCollection ? 'list' : '');
    const selectedDatasetFields = useMemo(
        () => selectedDatasetCollection ? buildPageCollectionDatasetFields(selectedDatasetCollection) : null,
        [selectedDatasetCollection],
    );
    const selectedDatasetContract = useMemo(
        () => selectedDatasetCollection
            ? buildPageCollectionDatasetContract(selectedDatasetCollection, selectedDatasetMode || 'list')
            : null,
        [selectedDatasetCollection, selectedDatasetMode],
    );
    const effectiveTemplateName = selectedFrontendTemplate
        ? `${selectedFrontendTemplate.name} frontend template`
        : selectedDatasetCollection
            ? `${selectedDatasetCollection.name} dataset ${selectedDatasetMode || 'list'} page`
        : selectedTemplate.name;
    const effectiveCanvasSize = selectedFrontendTemplate?.canvasSize || DEFAULT_CANVAS_SIZE;

    useEffect(() => {
        if (formData.designTemplateId && frontendDesign && !frontendPageTemplates.some((template) => template.id === formData.designTemplateId)) {
            updatePageDraft({ designTemplateId: '' });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.designTemplateId, frontendDesign, frontendPageTemplates]);

    const handleTemplateChange = (nextTemplate: PageTemplate) => {
        if (isPageCreateBusy || !canEditPages) return;

        const currentDefaults = TEMPLATE_DEFAULTS[formData.template];
        const nextDefaults = TEMPLATE_DEFAULTS[nextTemplate];
        const shouldApplyTitle = !formData.title.trim() || formData.title === currentDefaults.title;
        const shouldApplySlug = !formData.slug.trim() || formData.slug === currentDefaults.slug;
        const shouldApplyDescription = !formData.description.trim() || formData.description === currentDefaults.description;

        updatePageDraft({
            template: nextTemplate,
            title: shouldApplyTitle ? nextDefaults.title : formData.title,
            slug: formData.isHomepage ? 'index' : shouldApplySlug ? nextDefaults.slug : formData.slug,
            description: shouldApplyDescription ? nextDefaults.description : formData.description,
            navigationPlacement: DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[nextTemplate],
            navigationLabel: shouldApplyTitle ? nextDefaults.title : formData.navigationLabel || formData.title,
            seoTitle: shouldApplyTitle ? nextDefaults.title : formData.seoTitle || formData.title,
            designTemplateId: '',
        });
    };
    const handleFrontendTemplateChange = (template: SiteFrontendDesignTemplate) => {
        if (isPageCreateBusy || !canEditPages) return;

        const shouldApplyTitle = !formData.title.trim() || formData.title === TEMPLATE_DEFAULTS[formData.template].title;
        const routeSlug = routeSlugFromPattern(template.routePattern);
        const shouldApplySlug = Boolean(routeSlug) && (!formData.slug.trim() || formData.slug === TEMPLATE_DEFAULTS[formData.template].slug);
        const shouldApplyDescription = !formData.description.trim() || formData.description === TEMPLATE_DEFAULTS[formData.template].description;

        updatePageDraft({
            designTemplateId: template.id,
            title: shouldApplyTitle ? template.name : formData.title,
            slug: formData.isHomepage ? 'index' : shouldApplySlug ? routeSlug : formData.slug,
            description: shouldApplyDescription ? template.description || formData.description : formData.description,
            navigationLabel: shouldApplyTitle ? template.name : formData.navigationLabel || formData.title,
            seoTitle: shouldApplyTitle ? template.name : formData.seoTitle || formData.title,
        });
    };
    const handleDatasetCollectionChange = (collectionId: string) => {
        if (isPageCreateBusy || !canEditPages) return;

        const collection = collections.find((item) => item.id === collectionId) || null;
        const shouldApplyTitle = collection && (!formData.title.trim() || formData.title === TEMPLATE_DEFAULTS[formData.template].title);
        const shouldApplySlug = collection && !formData.isHomepage && (!formData.slug.trim() || formData.slug === TEMPLATE_DEFAULTS[formData.template].slug);
        const shouldApplyDescription = collection && (!formData.description.trim() || formData.description === TEMPLATE_DEFAULTS[formData.template].description);

        updatePageDraft({
            collectionId,
            datasetMode: collectionId ? formData.datasetMode || 'list' : '',
            title: shouldApplyTitle ? collection.name : formData.title,
            slug: shouldApplySlug ? collection.slug : formData.slug,
            description: shouldApplyDescription ? collection.description || formData.description : formData.description,
            navigationLabel: shouldApplyTitle ? collection.name : formData.navigationLabel || formData.title,
            seoTitle: shouldApplyTitle ? collection.name : formData.seoTitle || formData.title,
        });
    };
    const handleDatasetModeChange = (datasetMode: PageDatasetMode) => {
        if (isPageCreateBusy || !canEditPages || !formData.collectionId) return;

        updatePageDraft({ datasetMode });
    };
    const selectedSiteIdentifiers = useMemo(
        () => [formData.siteId, selectedSite?.id, selectedSite?.publicSiteId, selectedSite?.slug].filter((value): value is string => Boolean(value)),
        [formData.siteId, selectedSite?.id, selectedSite?.publicSiteId, selectedSite?.slug],
    );
    const selectedSitePages = useMemo(() => {
        const identifiers = new Set(selectedSiteIdentifiers);

        return pages.filter((page) => identifiers.has(page.siteId));
    }, [pages, selectedSiteIdentifiers]);
    const selectedParentPage = useMemo(
        () => selectedSitePages.find((page) => page.id === formData.parentPageId) || null,
        [formData.parentPageId, selectedSitePages],
    );
    useEffect(() => {
        const parentPageId = formData.parentPageId.trim();

        if (!parentPageId || selectedParentPage || !formData.siteId || isPermissionMatrixPending || !canViewPages) {
            return;
        }

        let cancelled = false;

        const loadSelectedParentPage = async () => {
            try {
                const parentPage = await getPage(formData.siteId, parentPageId);

                if (cancelled) {
                    return;
                }

                const currentPages = useStore.getState().pages;
                setPages([parentPage, ...currentPages.filter((page) => page.id !== parentPage.id)]);
                setRouteCheckError(null);
            } catch (parentLoadError) {
                if (!cancelled) {
                    setRouteCheckError(parentLoadError instanceof Error ? parentLoadError.message : 'Unable to load selected parent page.');
                }
            }
        };

        void loadSelectedParentPage();

        return () => {
            cancelled = true;
        };
    }, [canViewPages, formData.parentPageId, formData.siteId, isPermissionMatrixPending, selectedParentPage, setPages]);
    const selectableParentPages = useMemo(
        () => selectedSitePages
            .filter((page) => page.status !== 'archived')
            .sort((left, right) => (
                Number(Boolean(right.isHomepage)) - Number(Boolean(left.isHomepage))
                || left.title.localeCompare(right.title)
                || left.slug.localeCompare(right.slug)
            )),
        [selectedSitePages],
    );
    const routePreview = formData.isHomepage
        ? '/'
        : `/${slugify(formData.slug || formData.title || 'new-page')}`;
    const resolvedSlug = formData.isHomepage ? 'index' : slugify(formData.slug || formData.title || 'new-page');
    const titleDerivedSlug = slugify(formData.title || 'new-page');
    const canSyncSlugFromTitle = !isPageCreateBusy && canEditPages && !formData.isHomepage && Boolean(formData.title.trim()) && formData.slug !== titleDerivedSlug;
    const normalizedCanonicalPath = normalizeCanonicalPath(formData.canonicalPath || routePreview);
    const canonicalValid = normalizedCanonicalPath.startsWith('/');
    const effectiveSeoTitle = formData.seoTitle.trim() || formData.title.trim();
    const effectiveSeoDescription = formData.description.trim();
    const defaultKeywordText = [
        formData.title.trim(),
        effectiveTemplateName,
        selectedSite?.name || '',
        selectedFrontendTemplate ? 'frontend design template' : formData.template.replace('-', ' '),
    ].filter(Boolean).join(', ');
    const effectiveKeywords = normalizeKeywords(formData.keywords.trim() || defaultKeywordText);
    const jsonLdResult = parseJsonLd(formData.jsonLdText);
    const defaultJsonLd = useMemo(() => ([
        {
            '@context': 'https://schema.org',
            '@type': formData.template === 'contact' ? 'ContactPage' : formData.template === 'about' ? 'AboutPage' : 'WebPage',
            name: effectiveSeoTitle || formData.title.trim() || 'Untitled page',
            description: effectiveSeoDescription || undefined,
            url: normalizedCanonicalPath,
            isPartOf: selectedSite?.name ? {
                '@type': 'WebSite',
                name: selectedSite.name,
            } : undefined,
            image: formData.ogImage.trim() || undefined,
        },
    ]), [effectiveSeoDescription, effectiveSeoTitle, formData.ogImage, formData.template, formData.title, normalizedCanonicalPath, selectedSite?.name]);
    const effectiveJsonLd = jsonLdResult.ok && jsonLdResult.value.length > 0
        ? jsonLdResult.value
        : defaultJsonLd;
    const jsonLdValid = jsonLdResult.ok;
    const pageRouteConflict = useMemo(
        () => selectedSitePages.find((page) => getPagePublicPath(page) === routePreview) || null,
        [routePreview, selectedSitePages],
    );
    const collectionRouteConflict = useMemo(
        () => findCollectionRouteConflictForPageCreate(routePreview, collections),
        [collections, routePreview],
    );
    const routeConflict = pageRouteConflict
        ? {
            kind: 'page' as const,
            title: pageRouteConflict.title,
            message: `The ${routePreview} route is already used by "${pageRouteConflict.title}".`,
            page: pageRouteConflict,
        }
        : collectionRouteConflict;
    const isCollectionRouteCheckPending = canViewCollections && collectionsLoading;
    const collectionRouteCheckError = canViewCollections ? collectionsError : null;
    const scheduleValidationMessage = getScheduledPageDateError(formData.status, formData.scheduledAt);
    const hasFutureSchedule = scheduleValidationMessage === null;
    const minimumScheduledAt = toDateTimeLocalValue(new Date(Date.now() + 60_000).toISOString());
    const hasNavigationLabel = formData.navigationPlacement === 'none' || Boolean((formData.navigationLabel || formData.title).trim());
    const hasValidParentPage = !formData.parentPageId || Boolean(selectedParentPage);
    const datasetImportReady = !formData.collectionId || Boolean(selectedDatasetCollection);
    const adminPagesUrl = useMemo(
        () => `${getAdminApiBase()}/sites/${encodeURIComponent(formData.siteId || requestedSiteId)}/pages`,
        [formData.siteId, requestedSiteId],
    );
    const publishPermissionReady = formData.status === 'draft' || canPublishPages;
    const navigationPermissionReady = formData.navigationPlacement === 'none' || canApplyNavigationPlacement;
	    const canSubmit = Boolean(
	        canEditPages
	        &&
	        formData.title.trim()
        && formData.siteId
        && selectedSite
        && !isCheckingPages
        && publishPermissionReady
        && navigationPermissionReady
        && hasFutureSchedule
        && !routeConflict
        && !routeCheckError
        && !isCollectionRouteCheckPending
        && !collectionRouteCheckError
        && hasNavigationLabel
        && hasValidParentPage
        && canonicalValid
        && jsonLdValid
        && datasetImportReady
        && (!formData.isHomepage || formData.slug.trim() || formData.title.trim()),
    );
    const submitBlockerMessage = useMemo(() => {
        if (isLoading || canSubmit) return null;
        if (!canEditPages) return editPermissionTitle || 'Your account cannot create pages.';
        if (!publishPermissionReady) return publishPermissionTitle || 'Your account cannot publish or schedule pages during creation.';
        if (!navigationPermissionReady) return !canViewSites
            ? sitesViewPermissionTitle || 'Your account cannot read site navigation before placing this page in a menu.'
            : sitesConfigurePermissionTitle || 'Your account cannot update site navigation for this page.';
        if (isCheckingPages) return 'Checking existing routes for this site before creating the page.';
        if (routeCheckError) return 'Backy could not verify existing routes for this site. Refresh or choose the site again before creating the page.';
        if (isCollectionRouteCheckPending) return 'Checking collection routes for this site before creating the page.';
        if (collectionRouteCheckError) return 'Backy could not verify collection routes for this site. Refresh or choose the site again before creating the page.';
        if (!selectedSite) return 'Select a target site before creating this page.';
        if (!formData.title.trim()) return 'Add a page title so Backy can create a named page and editor document.';
        if (routeConflict) return routeConflict.message;
        if (!canonicalValid) return 'Use a canonical path that starts with / or paste a valid site URL.';
        if (!jsonLdValid) return jsonLdResult.message;
        if (formData.collectionId && collectionsLoading) return 'Loading the selected collection before creating the dataset page.';
        if (formData.collectionId && !selectedDatasetCollection) return collectionsError || 'Choose an existing collection before creating this dataset page.';
        if (!hasValidParentPage) return 'Choose an existing parent page or keep this page at the top level.';
        if (scheduleValidationMessage) return scheduleValidationMessage;
        if (!hasNavigationLabel) return 'Add a navigation label or choose not to add this page to navigation.';
        return 'Review the required page basics before creating this page.';
    }, [canEditPages, canSubmit, canViewSites, canonicalValid, collectionRouteCheckError, collectionsError, collectionsLoading, editPermissionTitle, formData.collectionId, formData.title, hasNavigationLabel, hasValidParentPage, isCheckingPages, isCollectionRouteCheckPending, isLoading, jsonLdResult, jsonLdValid, navigationPermissionReady, publishPermissionReady, publishPermissionTitle, routeCheckError, routeConflict, scheduleValidationMessage, selectedDatasetCollection, selectedSite, sitesConfigurePermissionTitle, sitesViewPermissionTitle]);
    const pageCreationReadiness = useMemo(() => {
        const resolvedSlug = formData.isHomepage ? 'index' : slugify(formData.slug || formData.title || 'new-page');
        const hasStarterCanvas = selectedFrontendTemplate ? true : selectedTemplate.sections.length > 0;
        const seedsSiteChrome = selectedFrontendTemplate ? Boolean(frontendDesign?.chrome && Object.keys(frontendDesign.chrome).length > 0) : formData.template !== 'blank';
        const checks = [
            {
                label: 'Target site',
                detail: selectedSite ? `${selectedSite.name} will own this page.` : 'Select a site before creating a page.',
                ready: Boolean(selectedSite),
            },
            {
                label: 'Page identity',
                detail: formData.title.trim() ? `${formData.title.trim()} -> /${formData.isHomepage ? '' : resolvedSlug}` : 'Add a page title.',
                ready: formData.title.trim().length > 0,
            },
            {
                label: 'Route shape',
                detail: formData.isHomepage ? 'This page will resolve as the homepage.' : `Public path will be /${resolvedSlug}.`,
                ready: Boolean(resolvedSlug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resolvedSlug)),
            },
            {
                label: 'Route availability',
                detail: routeCheckError
                    ? 'Backy could not verify existing routes for this site.'
                    : collectionRouteCheckError
                    ? 'Backy could not verify collection routes for this site.'
                    : isCollectionRouteCheckPending
                    ? 'Checking collection route reservations for this site.'
                    : routeConflict
                    ? routeConflict.message
                    : `${routePreview} is available in the current ${selectedSite?.name || 'site'} page library.`,
                ready: !routeConflict && !routeCheckError && !collectionRouteCheckError && !isCollectionRouteCheckPending,
            },
            {
                label: 'SEO summary',
                detail: effectiveSeoDescription
                    ? `${formData.description.trim().length} characters, ${effectiveKeywords.length} keyword${effectiveKeywords.length === 1 ? '' : 's'}, and canonical metadata ready`
                    : 'Add a short SEO description for frontend previews.',
                ready: effectiveSeoTitle.length > 0 && effectiveSeoDescription.length > 0 && canonicalValid && effectiveKeywords.length > 0,
            },
            {
                label: 'Structured data',
                detail: jsonLdValid
                    ? `${effectiveJsonLd.length} JSON-LD object${effectiveJsonLd.length === 1 ? '' : 's'} will be stored in page meta.`
                    : jsonLdResult.message,
                ready: jsonLdValid,
            },
            {
                label: 'Social metadata',
                detail: formData.ogImage.trim()
                    ? 'Open Graph image URL is set for social cards.'
                    : 'Optional Open Graph image can be added before create.',
                ready: true,
            },
            {
                label: 'Canvas seed',
                detail: selectedFrontendTemplate
                    ? `${selectedFrontendTemplate.name} will seed from the saved frontend design contract.`
                    : selectedDatasetCollection
                    ? `${selectedDatasetCollection.name} will seed a collection ${selectedDatasetMode || 'list'} dataset with reusable bindings.`
                    : hasStarterCanvas
                    ? `${selectedTemplate.sections.length} starter section${selectedTemplate.sections.length === 1 ? '' : 's'}${seedsSiteChrome ? ' plus editable header, navigation, and footer' : ''} will be created`
                    : 'Blank still creates a heading and intro copy.',
                ready: true,
            },
            ...(formData.collectionId ? [{
                label: 'Dataset import',
                detail: selectedDatasetCollection
                    ? `${selectedDatasetCollection.fields.length} fields mapped from ${selectedDatasetCollection.slug}.`
                    : collectionsLoading
                        ? 'Loading selected collection before create.'
                        : collectionsError || 'The selected collection was not found for this site.',
                ready: Boolean(selectedDatasetCollection),
            }] : []),
            {
                label: 'Publish timing',
                detail: formData.status === 'scheduled'
                    ? scheduleValidationMessage || 'Scheduled publish time is set.'
                    : `${formData.status} pages can be saved immediately.`,
                ready: hasFutureSchedule,
            },
            {
                label: 'Navigation',
                detail: formData.navigationPlacement === 'none'
                    ? 'The page will stay out of menus until you add it from site settings.'
                    : selectedParentPage
                        ? `The page will be nested under "${selectedParentPage.title}" in the ${formData.navigationPlacement} menu.`
                        : `The page will be added to the ${formData.navigationPlacement} menu as "${formData.navigationLabel.trim() || formData.title.trim() || 'Untitled page'}".`,
                ready: formData.navigationPlacement === 'none' || Boolean((formData.navigationLabel || formData.title).trim()),
            },
            {
                label: 'Hierarchy',
                detail: selectedParentPage
                    ? `Parent page: ${selectedParentPage.title}.`
                    : 'Top-level page unless nested later.',
                ready: !formData.parentPageId || Boolean(selectedParentPage),
            },
        ];
        const readyCount = checks.filter((check) => check.ready).length;

        return {
            score: Math.round((readyCount / checks.length) * 100),
            checks,
            workflow: [
                { label: 'Define route', detail: 'Pick the site, title, slug, homepage flag, status, and SEO summary.' },
                { label: 'Seed canvas', detail: 'Choose a starter template with editable sections, page chrome, and form blocks when needed.' },
                { label: 'Create record', detail: 'Persist page metadata and serialized editor content through the pages API.' },
                { label: 'Open editor', detail: 'Land in the visual editor to move, group, restyle, bind, and publish.' },
            ],
        };
    }, [
        formData.description,
        formData.keywords,
        formData.jsonLdText,
        formData.ogImage,
        formData.isHomepage,
        formData.canonicalPath,
        formData.noIndex,
        formData.noFollow,
        formData.scheduledAt,
        formData.siteId,
        formData.slug,
        formData.status,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.parentPageId,
        formData.seoTitle,
        formData.template,
        formData.title,
        formData.designTemplateId,
        formData.collectionId,
        canonicalValid,
        collectionRouteCheckError,
        collectionsError,
        collectionsLoading,
        effectiveSeoDescription,
        effectiveSeoTitle.length,
        effectiveKeywords.length,
        effectiveJsonLd.length,
        hasFutureSchedule,
        isCollectionRouteCheckPending,
        jsonLdResult,
        jsonLdValid,
        routeCheckError,
        routeConflict,
        routePreview,
        selectedSite,
        selectedParentPage,
        selectedFrontendTemplate,
        selectedDatasetCollection,
        selectedDatasetMode,
        selectedTemplate.sections.length,
        frontendDesign?.chrome,
    ]);
    const createPayloadPreview = useMemo(() => ({
        title: formData.title.trim() || 'Untitled page',
        slug: resolvedSlug,
        siteId: formData.siteId,
        status: formData.status,
        scheduledAt: formData.status === 'scheduled' ? formData.scheduledAt : null,
        template: selectedFrontendTemplate
            ? { id: selectedFrontendTemplate.id, source: 'frontend-design', name: selectedFrontendTemplate.name }
            : formData.template,
        description: formData.description,
        isHomepage: formData.isHomepage,
        routeAvailability: routeConflict
            ? routeConflict.kind === 'page'
                ? { status: 'conflict', kind: 'page', pageId: routeConflict.page.id, title: routeConflict.title, path: getPagePublicPath(routeConflict.page) }
                : { status: 'conflict', kind: routeConflict.kind, title: routeConflict.title, path: routeConflict.path, collectionId: routeConflict.collection?.id }
            : { status: 'available', checkedPages: selectedSitePages.length, checkedCollections: collections.length },
        content: selectedFrontendTemplate
            ? `${selectedFrontendTemplate.name} frontend contract seed`
            : `${selectedTemplate.sections.length + (formData.template === 'blank' ? 0 : 2)} starter block${selectedTemplate.sections.length === 1 ? '' : 's'}`,
        siteChrome: selectedFrontendTemplate
            ? 'captured from frontend design contract'
            : formData.template === 'blank' ? 'available from component library' : 'editable header, navigation, and footer seeded',
        forms: ['contact', 'newsletter', 'survey', 'registration', 'member-login', 'member-account'].includes(formData.template) ? 'Backy form API seeded' : 'none',
        dynamicData: formData.template === 'storefront'
            ? 'Backy products catalog placeholders'
            : formData.template === 'product-detail'
                ? 'Backy product detail placeholders'
                : formData.template === 'pricing'
                    ? 'Backy pricing plan placeholders'
                : formData.template === 'services'
                    ? 'Backy service package placeholders'
                : formData.template === 'booking'
                    ? 'Backy booking and appointment placeholders'
                : formData.template === 'portfolio'
                    ? 'Backy portfolio project placeholders'
                : formData.template === 'gallery'
                    ? 'Backy media gallery placeholders'
                : formData.template === 'events'
                    ? 'Backy event schedule placeholders'
                : formData.template === 'privacy'
                    ? 'Backy legal policy placeholders'
                : formData.template === 'terms'
                    ? 'Backy legal terms placeholders'
                : formData.template === 'cookie-policy'
                    ? 'Backy cookie consent placeholders'
                : formData.template === 'accessibility-statement'
                    ? 'Backy accessibility statement placeholders'
                : formData.template === 'refund-policy'
                    ? 'Backy refund policy placeholders'
                : formData.template === 'shipping-policy'
                    ? 'Backy shipping policy placeholders'
                : formData.template === 'cart'
                    ? 'Backy cart placeholders'
                : formData.template === 'checkout'
                    ? 'Backy checkout and order placeholders'
                    : formData.template === 'order-confirmation'
                    ? 'Backy order confirmation placeholders'
                    : formData.template === 'help-center'
                        ? 'Backy help center placeholders'
                    : formData.template === 'faq'
                        ? 'Backy FAQ placeholders'
                    : formData.template === 'testimonials'
                        ? 'Backy testimonial and review placeholders'
            : selectedDatasetCollection
                ? `Collection dataset ${selectedDatasetMode || 'list'} page for ${selectedDatasetCollection.name}`
            : formData.template === 'blog-index'
                ? 'Backy blog feed placeholders'
            : formData.template === 'blog-post'
                ? 'Backy blog post placeholders'
            : formData.template === 'team'
                ? 'Backy team profile placeholders'
            : formData.template === 'careers'
                ? 'Backy careers and job posting placeholders'
                : 'none',
        datasetImport: selectedDatasetContract,
        navigation: formData.navigationPlacement === 'none'
            ? { placement: 'none', parentPageId: selectedParentPage?.id || null }
            : {
                placement: formData.navigationPlacement,
                label: formData.navigationLabel.trim() || formData.title.trim() || 'Untitled page',
                parentPageId: selectedParentPage?.id || null,
                parentTitle: selectedParentPage?.title || null,
            },
        hierarchy: selectedParentPage
            ? { parentPageId: selectedParentPage.id, parentTitle: selectedParentPage.title, parentPath: getPagePublicPath(selectedParentPage) }
            : { parentPageId: null },
        seo: {
            title: effectiveSeoTitle || 'Untitled page',
            description: effectiveSeoDescription,
            canonical: normalizedCanonicalPath,
            keywords: effectiveKeywords,
            jsonLd: effectiveJsonLd,
            ogImage: formData.ogImage.trim() || null,
            robots: {
                index: !formData.noIndex,
                follow: !formData.noFollow,
            },
        },
    }), [
        formData.description,
        formData.isHomepage,
        formData.keywords,
        formData.jsonLdText,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.noFollow,
        formData.noIndex,
        formData.ogImage,
        formData.scheduledAt,
        formData.siteId,
        formData.status,
        formData.template,
        formData.title,
        formData.designTemplateId,
        selectedDatasetCollection,
        selectedDatasetContract,
        selectedDatasetFields,
        selectedDatasetMode,
        effectiveSeoDescription,
        effectiveSeoTitle,
        effectiveKeywords,
        effectiveJsonLd,
        normalizedCanonicalPath,
        routeConflict,
        resolvedSlug,
        collections.length,
        selectedSitePages.length,
        selectedParentPage,
        selectedFrontendTemplate,
        selectedTemplate.sections.length,
    ]);
    const creationHandoff = useMemo(() => ({
        generatedAt: new Date().toISOString(),
        endpoint: {
            method: 'POST',
            url: adminPagesUrl,
        },
        site: {
            id: formData.siteId,
            name: selectedSite?.name || formData.siteId,
            slug: selectedSite?.slug || formData.siteId,
        },
        route: {
            slug: resolvedSlug,
            path: routePreview,
            isHomepage: formData.isHomepage,
            availability: routeConflict
                ? routeConflict.kind === 'page'
                    ? {
                        status: 'conflict',
                        kind: 'page',
                        pageId: routeConflict.page.id,
                        title: routeConflict.title,
                        path: getPagePublicPath(routeConflict.page),
                    }
                    : {
                        status: 'conflict',
                        kind: routeConflict.kind,
                        title: routeConflict.title,
                        path: routeConflict.path,
                        collectionId: routeConflict.collection?.id,
                    }
                : {
                    status: 'available',
                    checkedPages: selectedSitePages.length,
                    checkedCollections: collections.length,
                },
        },
        readiness: {
            score: pageCreationReadiness.score,
            checks: pageCreationReadiness.checks,
        },
        template: {
            id: selectedFrontendTemplate?.id || selectedTemplate.id,
            name: selectedFrontendTemplate?.name || selectedTemplate.name,
            source: selectedFrontendTemplate ? 'frontend-design' : 'backy-starter',
            sections: selectedFrontendTemplate ? selectedFrontendTemplate.bindingHints || [] : selectedTemplate.sections,
            seedsFormApi: ['contact', 'newsletter', 'survey', 'registration', 'member-login', 'member-account'].includes(formData.template),
            seedsDynamicData: ['storefront', 'product-detail', 'pricing', 'services', 'booking', 'portfolio', 'gallery', 'events', 'privacy', 'terms', 'cookie-policy', 'accessibility-statement', 'refund-policy', 'shipping-policy', 'cart', 'checkout', 'order-confirmation', 'help-center', 'faq', 'testimonials', 'blog-index', 'blog-post', 'team', 'careers'].includes(formData.template) || Boolean(selectedDatasetCollection),
            navigationPlacement: formData.navigationPlacement,
            navigationLabel: formData.navigationLabel.trim() || formData.title.trim() || 'Untitled page',
            parentPageId: selectedParentPage?.id || null,
            parentTitle: selectedParentPage?.title || null,
        },
        datasetImport: selectedDatasetContract,
        hierarchy: selectedParentPage
            ? {
                parentPageId: selectedParentPage.id,
                parentTitle: selectedParentPage.title,
                parentPath: getPagePublicPath(selectedParentPage),
                navigationBehavior: formData.navigationPlacement === 'none'
                    ? 'Stored in page meta only'
                    : `Nested under parent in ${formData.navigationPlacement} navigation`,
            }
            : {
                parentPageId: null,
                navigationBehavior: formData.navigationPlacement === 'none' ? 'No navigation change' : 'Top-level navigation item',
            },
        seo: {
            title: effectiveSeoTitle || formData.title.trim() || 'Untitled page',
            description: effectiveSeoDescription,
            canonical: normalizedCanonicalPath,
            keywords: effectiveKeywords,
            jsonLd: effectiveJsonLd,
            ogImage: formData.ogImage.trim() || null,
            robots: {
                index: !formData.noIndex,
                follow: !formData.noFollow,
            },
            renderPayloadKeys: ['seo.title', 'seo.description', 'seo.canonical', 'seo.keywords', 'seo.jsonLd', 'seo.openGraph.image', 'seo.robots'],
        },
        canvas: {
            width: effectiveCanvasSize.width,
            height: selectedFrontendTemplate?.canvasSize?.height || getCanvasHeightForElements(buildTemplateElements({
                template: formData.template,
                title: formData.title.trim() || 'Untitled page',
                slug: resolvedSlug,
                description: formData.description,
            })),
            seededBlocks: selectedFrontendTemplate ? selectedFrontendTemplate.bindingHints?.length || 1 : selectedTemplate.sections.length,
            siteChrome: selectedFrontendTemplate ? 'frontend design contract' : formData.template === 'blank' ? 'component library' : ['header', 'navigation', 'footer'],
        },
        payloadPreview: createPayloadPreview,
        nextStep: 'Created pages open directly in the visual editor for layout, grouping, media, binding, SEO, and publishing work.',
        guardrails: [
            'The creator blocks route and homepage collisions visible in the current page library; the backend remains final validation.',
            'Scheduled pages require a publish date before they can be created.',
            'Contact, registration, member-login, and member-account templates seed editable form blocks that connect to Backy Forms and Contacts.',
            'Storefront, product-detail, pricing, services, booking, portfolio, events, privacy, terms, cookie policy, accessibility statement, refund policy, shipping policy, cart, checkout, order-confirmation, help-center, FAQ, testimonials, blog index, blog post, team, and careers templates seed dynamic data placeholders for products, plans, services, appointments, projects, events, legal and commerce policy content, carts, orders, support content, reusable answers, reviews, posts, people profiles, and job postings.',
            'Non-blank templates seed editable header, navigation, and footer blocks so public frontend chrome is controlled from Backy.',
            'Navigation placement updates the site navigation settings after the page record is created.',
            'Parent placement stores page hierarchy in meta and nests navigation under the selected parent when navigation placement is enabled.',
            'SEO metadata is saved into page meta so render payloads, manifests, and custom frontends can use it immediately.',
            'Keywords and JSON-LD are generated by default and can be overridden before create.',
            'The canvas seed is serialized before persistence so the editor never starts from a blank record unless the user intentionally keeps the starter sparse.',
        ],
    }), [
        adminPagesUrl,
        createPayloadPreview,
        formData.description,
        formData.isHomepage,
        formData.keywords,
        formData.jsonLdText,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.noFollow,
        formData.noIndex,
        formData.ogImage,
        formData.scheduledAt,
        formData.siteId,
        formData.status,
        formData.template,
        formData.title,
        formData.designTemplateId,
        effectiveSeoDescription,
        effectiveSeoTitle,
        effectiveKeywords,
        effectiveJsonLd,
        normalizedCanonicalPath,
        pageCreationReadiness.checks,
        pageCreationReadiness.score,
        resolvedSlug,
        routeConflict,
        routePreview,
        collections.length,
        selectedSitePages.length,
        selectedSite?.name,
        selectedSite?.slug,
        selectedParentPage,
        selectedFrontendTemplate,
        selectedDatasetCollection,
        selectedDatasetContract,
        selectedDatasetFields,
        selectedDatasetMode,
        selectedTemplate.id,
        selectedTemplate.name,
        selectedTemplate.sections,
        effectiveCanvasSize.height,
        effectiveCanvasSize.width,
    ]);
    const creationHandoffText = useMemo(() => JSON.stringify(creationHandoff, null, 2), [creationHandoff]);
    const hasAutosaveContent = useMemo(() => (
        formData.title.trim().length > 0
        || formData.slug.trim().length > 0
        || formData.description.trim().length > 0
        || formData.template !== 'blank'
        || formData.status !== 'draft'
        || Boolean(formData.scheduledAt)
        || formData.isHomepage
        || formData.parentPageId.trim().length > 0
        || formData.navigationPlacement !== DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[formData.template]
        || formData.navigationLabel.trim().length > 0
        || formData.seoTitle.trim().length > 0
        || formData.canonicalPath.trim().length > 0
        || formData.keywords.trim().length > 0
        || formData.jsonLdText.trim().length > 0
        || formData.ogImage.trim().length > 0
        || formData.noIndex
        || formData.noFollow
        || formData.designTemplateId.trim().length > 0
        || formData.collectionId.trim().length > 0
        || Boolean(formData.datasetMode)
    ), [
        formData.canonicalPath,
        formData.collectionId,
        formData.datasetMode,
        formData.description,
        formData.designTemplateId,
        formData.isHomepage,
        formData.keywords,
        formData.jsonLdText,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.parentPageId,
        formData.noFollow,
        formData.noIndex,
        formData.ogImage,
        formData.scheduledAt,
        formData.seoTitle,
        formData.slug,
        formData.status,
        formData.template,
        formData.title,
    ]);

    useEffect(() => {
        if (!hasHydratedAutosave || autosavePausedForRecovery || isLoading) {
            return;
        }

        if (!hasAutosaveContent) {
            window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
            setLastAutosavedAt(null);
            setAutosaveStatus('Autosave ready');
            return;
        }

        setAutosaveStatus('Saving draft...');
        const autosaveTimer = window.setTimeout(() => {
            try {
                const savedAt = new Date().toISOString();
                const draft: PageCreateAutosaveDraft = {
                    version: 1,
                    savedAt,
                    formData,
                };
                window.localStorage.setItem(PAGE_CREATE_AUTOSAVE_KEY, JSON.stringify(draft));
                setLastAutosavedAt(savedAt);
                setAutosaveStatus(`Autosaved ${new Date(savedAt).toLocaleTimeString()}`);
            } catch {
                setAutosaveStatus('Autosave failed');
            }
        }, 800);

        return () => window.clearTimeout(autosaveTimer);
    }, [
        autosavePausedForRecovery,
        formData,
        hasAutosaveContent,
        hasHydratedAutosave,
        isLoading,
    ]);

    const clearAutosavedDraft = () => {
        window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(null);
        setAutosaveStatus('Autosave ready');
    };

    const restoreRecoveredDraft = () => {
        if (!draftRecovery || isPageCreateBusy || !canEditPages) return;

        const recoveredFormData: PageCreateDraftState = {
            ...draftRecovery.formData,
            designTemplateId: draftRecovery.formData.designTemplateId || '',
            collectionId: draftRecovery.formData.collectionId || '',
            datasetMode: draftRecovery.formData.datasetMode || '',
        };

        setFormData(recoveredFormData);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(draftRecovery.savedAt);
        setAutosaveStatus('Recovered draft restored');
        setError(null);
        setNotice('Recovered local page draft.');
        navigate({ to: '/pages/new', search: buildRouteSearchFromForm(recoveredFormData), replace: true });
    };

    const discardRecoveredDraft = () => {
        if (isPageCreateBusy) return;

        clearAutosavedDraft();
        setError(null);
        setNotice('Recovered draft discarded.');
    };

    const autosaveLabel = draftRecovery
        ? `Recovery from ${new Date(draftRecovery.savedAt).toLocaleTimeString()}`
        : lastAutosavedAt
            ? `Autosaved ${new Date(lastAutosavedAt).toLocaleTimeString()}`
            : autosaveStatus;

    const copyCreationText = async (value: string, label: string) => {
        if (isPageCreateBusy) return;
        if (!canEditPages) {
            setNotice(editPermissionTitle || 'Your account cannot prepare page creation handoff data.');
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
        if (isPageCreateBusy) return;
        if (!canEditPages) {
            setNotice(editPermissionTitle || 'Your account cannot download page creation handoff data.');
            return;
        }

        const blob = new Blob([creationHandoffText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${resolvedSlug || 'new-page'}-backy-page-create-handoff.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setError(null);
        setNotice('Page creation handoff manifest downloaded.');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isPageCreateBusy) return;

        if (!canEditPages) {
            setError(editPermissionTitle || 'Your account cannot create pages.');
            setNotice(null);
            return;
        }

        if (!publishPermissionReady) {
            setError(publishPermissionTitle || 'Your account cannot publish or schedule pages during creation.');
            setNotice(null);
            return;
        }

        if (!navigationPermissionReady) {
            setError(!canViewSites
                ? sitesViewPermissionTitle || 'Your account cannot read site navigation before placing this page in a menu.'
                : sitesConfigurePermissionTitle || 'Your account cannot update site navigation for this page.');
            setNotice(null);
            return;
        }

        const currentScheduleValidationMessage = getScheduledPageDateError(formData.status, formData.scheduledAt);
        if (currentScheduleValidationMessage) {
            setError(currentScheduleValidationMessage);
            setNotice(null);
            return;
        }

        if (!canSubmit) {
            if (routeConflict) {
                setError(routeConflict.message);
            } else if (scheduleValidationMessage) {
                setError(scheduleValidationMessage);
            } else if (!hasNavigationLabel) {
                setError('Add a navigation label or choose not to add this page to navigation.');
            } else if (!jsonLdValid) {
                setError(jsonLdResult.message);
            } else {
                setError('Add a page title and select a site before creating the page.');
            }
            setNotice(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setNotice(null);
        setRouteCheckError(null);

        const title = formData.title.trim();
        const slug = resolvedSlug;
        const content = createInitialPageContent({
            template: formData.template,
            frontendTemplate: selectedFrontendTemplate,
            frontendDesign,
            datasetCollection: selectedDatasetCollection,
            datasetMode: selectedDatasetMode || undefined,
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
            parentId: selectedParentPage?.id || null,
            meta: {
                title: effectiveSeoTitle || title,
                description: formData.description,
                canonical: normalizedCanonicalPath,
                keywords: effectiveKeywords,
                jsonLd: effectiveJsonLd,
                ogImage: formData.ogImage.trim() || undefined,
                noIndex: formData.noIndex,
                noFollow: formData.noFollow,
                template: formData.template,
                frontendDesignTemplateId: selectedFrontendTemplate?.id,
                frontendDesignTemplateName: selectedFrontendTemplate?.name,
                frontendDesignSource: selectedFrontendTemplate ? frontendDesign?.source : undefined,
                frontendDesignRoutePattern: selectedFrontendTemplate?.routePattern,
                frontendDesignTokens: selectedFrontendTemplate ? frontendDesign?.tokens : undefined,
                frontendDesignChrome: selectedFrontendTemplate ? frontendDesign?.chrome : undefined,
                frontendDesignCustomCss: selectedFrontendTemplate ? frontendDesign?.tokens?.customCss : undefined,
                frontendDesignBindingHints: selectedFrontendTemplate?.bindingHints,
                navigationPlacement: formData.navigationPlacement,
                navigationLabel: formData.navigationLabel.trim() || title,
                parentPageId: selectedParentPage?.id || undefined,
                parentPageTitle: selectedParentPage?.title || undefined,
                collectionDataset: selectedDatasetContract || undefined,
            },
            content,
        };

        try {
            const created = await createPage(formData.siteId, input);
            let navigationWarning: string | null = null;
            try {
                await applyPageNavigationPlacement({
                    siteId: formData.siteId,
                    page: created,
                    placement: formData.navigationPlacement,
                    label: formData.navigationLabel.trim() || title,
                    parentPage: selectedParentPage,
                });
            } catch (navigationError) {
                console.warn('Page was created, but navigation placement failed.', navigationError);
                navigationWarning = navigationError instanceof Error
                    ? `Page was created, but navigation placement failed: ${navigationError.message}`
                    : 'Page was created, but navigation placement failed. Update navigation manually from site settings.';
            }
            clearAutosavedDraft();
            setPages([created, ...pages.filter((page) => page.id !== created.id)]);
            navigate({
                to: '/pages/$pageId/edit',
                params: { pageId: created.id },
                search: {
                    siteId: formData.siteId,
                    ...(navigationWarning ? { navWarning: navigationWarning } : {}),
                },
            });
        } catch (createError) {
            setError(createError instanceof Error
                ? `${createError.message}. The page was not created because the backend did not persist it.`
                : 'Unable to create page. The page was not persisted.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isPermissionMatrixPending && !canEditPages) {
        return (
            <PageShell
                title="Page creation unavailable"
                description={editPermissionTitle || 'Your account cannot create pages.'}
            >
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {permissionError || editPermissionTitle || 'Ask an owner or admin to grant pages.edit access.'}
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell
            title="Create page"
            description={selectedSite ? `Add a routable, editable page to ${selectedSite.name}.` : 'Add a new page to your site.'}
            action={
                <button
                    type="button"
                    onClick={() => {
                        if (isPageCreateBusy) return;
                        navigate({ to: '/pages', search: { siteId: formData.siteId } });
                    }}
                    disabled={isPageCreateBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Pages
                </button>
            }
            className="w-full min-w-0"
        >
            <section className="mb-6 min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="page-creation-command-center">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-foreground">Page creation command center</h2>
                            <span className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-semibold',
                                pageCreationReadiness.score >= 80
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700',
                            )}
                            >
                                {pageCreationReadiness.score}% ready
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
                            Prepare the public route, metadata, template seed, publish state, and editor handoff before creating the page.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void copyCreationText(creationHandoffText, 'Page creation handoff manifest')}
                            disabled={isPageCreateBusy}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Copy className="h-4 w-4" />
                            Copy handoff
                        </button>
                        <button
                            type="button"
                            onClick={downloadCreationHandoff}
                            disabled={isPageCreateBusy}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Download className="h-4 w-4" />
                            Download JSON
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (isPageCreateBusy || !canCreateSites) return;
                                navigate({ to: '/sites/new' });
                            }}
                            disabled={isPageCreateBusy || !canCreateSites}
                            title={!canCreateSites ? sitesCreatePermissionTitle : undefined}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Globe className="h-4 w-4" />
                            Create site
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                    <div className="rounded-lg border border-border bg-background p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold">Creation readiness</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Checks whether this page will open in the editor with a usable route, metadata, canvas, and publish plan.
                                </p>
                            </div>
                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                                {formData.template}
                            </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className={cn(
                                    'h-full rounded-full',
                                    pageCreationReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                                )}
                                style={{ width: `${pageCreationReadiness.score}%` }}
                            />
                        </div>
                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {pageCreationReadiness.checks.map((check) => (
                                <PageCreationCheck key={check.label} {...check} />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">Create-to-editor workflow</h3>
                        </div>
                        <div className="mt-3 grid gap-2">
                            {pageCreationReadiness.workflow.map((step, index) => (
                                <PageCreationWorkflowStep key={step.label} index={index + 1} {...step} />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-background p-4">
                    <div>
                        <h3 className="text-sm font-semibold">Creation control map</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Jump through the decisions that make a page routable, editable, and ready for custom frontend APIs.
                        </p>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {PAGE_CREATION_AREAS.map((area) => (
                            <a
                                key={area.title}
                                href={area.href}
                                aria-disabled={isPageCreateBusy}
                                onClick={(event) => {
                                    if (isPageCreateBusy) event.preventDefault();
                                }}
                                className={cn(
                                    'rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5',
                                    isPageCreateBusy && 'pointer-events-none opacity-60',
                                )}
                            >
                                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                {error && (
                    <div className="xl:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{error}</span>
                            {routeCheckError && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isPageCreateBusy) return;
                                        setRouteCheckRetry((value) => value + 1);
                                    }}
                                    disabled={isPageCreateBusy}
                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <RefreshCw className={cn('h-3.5 w-3.5', isCheckingPages && 'animate-spin')} />
                                    Retry route check
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {notice && (
                    <div className="xl:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        {notice}
                    </div>
                )}

                {draftRecovery && (
                    <div className="xl:col-span-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" data-testid="page-create-recovery">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                Local autosave found a page draft from {new Date(draftRecovery.savedAt).toLocaleString()} for {draftRecovery.formData.siteId}.
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={discardRecoveredDraft}
                                    disabled={isPageCreateBusy}
                                    className="inline-flex items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Discard recovery
                                </button>
                                <button
                                    type="button"
                                    onClick={restoreRecoveredDraft}
                                    disabled={isPageCreateBusy}
                                    className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Restore draft
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {formData.collectionId && (
                    <div className="xl:col-span-2 rounded-lg border border-cyan-200 bg-cyan-50/60 px-4 py-3 text-sm text-cyan-950" data-testid="page-create-dataset-import">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className="font-semibold">Collection dataset import</div>
                                <div className="mt-1 text-cyan-900/80">
                                    {selectedDatasetCollection
                                        ? `${selectedDatasetCollection.name} will seed a ${selectedDatasetMode || 'list'} page with editable collection bindings.`
                                        : collectionsLoading
                                            ? 'Loading selected collection before page creation.'
                                            : collectionsError || 'The selected collection was not found for this site.'}
                                </div>
                            </div>
                            <div className="grid gap-2 font-mono text-xs sm:grid-cols-2 lg:min-w-[420px]">
                                <div className="rounded-md bg-white/80 px-2 py-1">collection {formData.collectionId}</div>
                                <div className="rounded-md bg-white/80 px-2 py-1">mode {selectedDatasetMode || 'list'}</div>
                                <div className="rounded-md bg-white/80 px-2 py-1">title {selectedDatasetFields?.titleField?.key || 'unmapped'}</div>
                                <div className="rounded-md bg-white/80 px-2 py-1">media {selectedDatasetFields?.imageField?.key || 'unmapped'}</div>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="min-w-0 space-y-6">
                    <div id="page-basics" className="space-y-6 rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
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
                                    onChange={(e) => selectPageSite(e.target.value)}
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
                                    onChange={(e) => updatePageDraft({
                                        title: e.target.value,
                                        slug: formData.slug ? formData.slug : slugify(e.target.value),
                                        navigationLabel: formData.navigationLabel ? formData.navigationLabel : e.target.value,
                                        seoTitle: formData.seoTitle ? formData.seoTitle : e.target.value,
                                    })}
                                    placeholder="About us"
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    required
                                />
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <label htmlFor="page-slug" className="block text-sm font-medium">URL slug</label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!canSyncSlugFromTitle) return;
                                            updatePageDraft({ slug: titleDerivedSlug });
                                        }}
                                        disabled={!canSyncSlugFromTitle}
                                        data-testid="page-slug-use-title"
                                        className="text-xs font-semibold text-primary transition hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
                                    >
                                        Use title
                                    </button>
                                </div>
                                <div className="flex items-center">
                                    <span className="rounded-l-lg border border-r-0 bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                                        /
                                    </span>
                                    <input
                                        id="page-slug"
                                        type="text"
                                        value={formData.slug}
                                        onChange={(e) => updatePageDraft({ slug: slugify(e.target.value) })}
                                        placeholder="about"
                                        disabled={isPageCreateBusy || formData.isHomepage}
                                        className="min-w-0 flex-1 rounded-r-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-description" className="mb-2 block text-sm font-medium">SEO description</label>
                            <textarea
                                id="page-description"
                                value={formData.description}
                                onChange={(e) => updatePageDraft({ description: e.target.value })}
                                placeholder="Short summary for search previews and frontend route metadata."
                                rows={3}
                                disabled={isPageCreateBusy}
                                className="w-full resize-none rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>

                        <label className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 transition hover:bg-accent',
                            isPageCreateBusy && 'cursor-not-allowed opacity-70'
                        )}>
                            <input
                                type="checkbox"
                                checked={formData.isHomepage}
                                disabled={isPageCreateBusy}
                                onChange={(e) => {
                                    const isHomepage = e.target.checked;
                                    updatePageDraft({
                                        isHomepage,
                                        slug: isHomepage ? 'index' : formData.slug,
                                        parentPageId: isHomepage ? '' : formData.parentPageId,
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
                                    Creates the page as `/` for the selected site. Backy checks the current page library before create.
                                </span>
                            </span>
                        </label>

                        {routeConflict && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="page-route-conflict">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="font-semibold">Route is unavailable</div>
                                        <p className="mt-1">
                                            {routeConflict.message} Choose a different slug, unset homepage, or adjust the conflicting route.
                                        </p>
                                    </div>
                                    {routeConflict.kind === 'page' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isPageCreateBusy || !canEditPages) return;
                                                navigate({
                                                    to: '/pages/$pageId/edit',
                                                    params: { pageId: routeConflict.page.id },
                                                    search: { siteId: formData.siteId },
                                                });
                                            }}
                                            disabled={isPageCreateBusy || !canEditPages}
                                            title={!canEditPages ? editPermissionTitle : undefined}
                                            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Open existing page
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border border-border bg-background p-4" data-testid="page-navigation-placement">
                            <div className="flex items-start gap-3">
                                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                                    <Menu className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-foreground">Navigation placement</h3>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                        Add the new page to site navigation so hosted pages, manifests, render payloads, and custom frontends can expose it immediately after publish.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
                                <div>
                                    <label htmlFor="page-navigation-placement-select" className="mb-2 block text-sm font-medium">Placement</label>
                                    <select
	                                        id="page-navigation-placement-select"
	                                        value={formData.navigationPlacement}
	                                        onChange={(event) => updatePageDraft({
	                                            navigationPlacement: event.target.value as PageNavigationPlacement,
	                                            navigationLabel: formData.navigationLabel || formData.title,
	                                        })}
	                                        disabled={isPageCreateBusy}
	                                        title={!canApplyNavigationPlacement && formData.navigationPlacement !== 'none' ? sitesConfigurePermissionTitle || sitesViewPermissionTitle : undefined}
	                                        className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
	                                    >
	                                        <option value="none">Do not add</option>
	                                        <option value="primary" disabled={!canApplyNavigationPlacement}>Primary menu</option>
	                                        <option value="footer" disabled={!canApplyNavigationPlacement}>Footer menu</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="page-navigation-label" className="mb-2 block text-sm font-medium">Menu label</label>
                                    <input
                                        id="page-navigation-label"
                                        type="text"
                                        value={formData.navigationLabel}
                                        onChange={(event) => updatePageDraft({ navigationLabel: event.target.value })}
	                                        placeholder={formData.title || 'Navigation label'}
	                                        disabled={isPageCreateBusy || formData.navigationPlacement === 'none' || !canApplyNavigationPlacement}
                                        className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label htmlFor="page-parent-page" className="mb-2 block text-sm font-medium">Parent page</label>
                                <select
                                    id="page-parent-page"
                                    value={formData.parentPageId}
                                    onChange={(event) => updatePageDraft({ parentPageId: event.target.value })}
                                    disabled={isPageCreateBusy || formData.isHomepage || selectableParentPages.length === 0}
                                    className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="">Top-level page</option>
                                    {selectableParentPages.map((page) => (
                                        <option key={page.id} value={page.id}>
                                            {page.isHomepage ? 'Home' : page.title} ({getPagePublicPath(page)})
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                    {selectedParentPage
                                        ? `Backy will save ${selectedParentPage.title} as the parent and nest this page beneath it when menu placement is enabled.`
                                        : formData.isHomepage
                                            ? 'Homepage routes stay at the top level.'
                                        : 'Top-level pages can still be moved into navigation groups from site settings later.'}
                                </p>
                            </div>
                            <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                                {formData.navigationPlacement === 'none'
                                    ? selectedParentPage
                                        ? 'The page record will keep its parent metadata without changing site navigation.'
                                        : 'The page record will be created without changing site navigation.'
                                    : selectedParentPage
                                        ? `Backy will nest this page under ${selectedParentPage.title} in the ${formData.navigationPlacement} menu after create.`
                                        : `Backy will append this page to the ${formData.navigationPlacement} menu after create.`}
                            </div>
                        </div>
                    </div>

                    <div id="page-seo" className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
                                <Search className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold text-foreground">SEO and social metadata</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    These values are saved into page meta and exposed through the public render payload for custom frontends.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="text-blue-700 text-lg hover:underline">
                                {effectiveSeoTitle || 'Page Title'}
                            </div>
                            <div className="mt-1 text-sm text-green-700">
                                {selectedSite?.slug || selectedSite?.name || 'site'}{normalizedCanonicalPath}
                            </div>
                            <div className="mt-1 text-sm leading-5 text-muted-foreground">
                                {effectiveSeoDescription || 'Page description will appear here...'}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="page-seo-title" className="mb-2 block text-sm font-medium">Search title</label>
                                <input
                                    id="page-seo-title"
                                    type="text"
                                    value={formData.seoTitle}
                                    onChange={(event) => updatePageDraft({ seoTitle: event.target.value })}
                                    placeholder={formData.title || 'Search result title'}
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <div className="mt-1 text-xs text-muted-foreground">{effectiveSeoTitle.length} characters</div>
                            </div>

                            <div>
                                <label htmlFor="page-canonical-path" className="mb-2 block text-sm font-medium">Canonical path</label>
                                <input
                                    id="page-canonical-path"
                                    type="text"
                                    value={formData.canonicalPath}
                                    onChange={(event) => updatePageDraft({ canonicalPath: event.target.value })}
                                    placeholder={routePreview}
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-card px-4 py-2.5 font-mono text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <div className={cn('mt-1 text-xs', canonicalValid ? 'text-muted-foreground' : 'text-amber-700')}>
                                    {normalizedCanonicalPath}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-seo-keywords" className="mb-2 block text-sm font-medium">Keywords</label>
                            <input
                                id="page-seo-keywords"
                                type="text"
                                value={formData.keywords}
                                onChange={(event) => updatePageDraft({ keywords: event.target.value })}
                                placeholder={defaultKeywordText || 'brand, service, page topic'}
                                disabled={isPageCreateBusy}
                                className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <div className="mt-1 text-xs text-muted-foreground">
                                {effectiveKeywords.length} keyword{effectiveKeywords.length === 1 ? '' : 's'} will be saved into page meta.
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-json-ld" className="mb-2 block text-sm font-medium">JSON-LD structured data</label>
                            <textarea
                                id="page-json-ld"
                                value={formData.jsonLdText}
                                onChange={(event) => updatePageDraft({ jsonLdText: event.target.value })}
                                placeholder={JSON.stringify(defaultJsonLd, null, 2)}
                                rows={7}
                                disabled={isPageCreateBusy}
                                className={cn(
                                    'w-full resize-y rounded-lg border bg-card px-4 py-2.5 font-mono text-xs leading-5 outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                                    !jsonLdValid && 'border-amber-300 focus:ring-amber-300',
                                )}
                            />
                            <div className={cn('mt-1 text-xs', jsonLdValid ? 'text-muted-foreground' : 'text-amber-700')}>
                                {jsonLdValid
                                    ? `${effectiveJsonLd.length} JSON-LD object${effectiveJsonLd.length === 1 ? '' : 's'} will be saved. Leave empty to use the generated default.`
                                    : jsonLdResult.message}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-og-image" className="mb-2 block text-sm font-medium">Open Graph image URL</label>
                            <div className="relative">
                                <ImageIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    id="page-og-image"
                                    type="url"
                                    value={formData.ogImage}
                                    onChange={(event) => updatePageDraft({ ogImage: event.target.value })}
                                    placeholder="https://..."
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-card py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <label className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:bg-accent',
                                isPageCreateBusy && 'cursor-not-allowed opacity-70',
                            )}>
                                <input
                                    type="checkbox"
                                    checked={formData.noIndex}
                                    onChange={(event) => updatePageDraft({ noIndex: event.target.checked })}
                                    disabled={isPageCreateBusy}
                                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                                />
                                <span>
                                    <span className="block text-sm font-semibold">No index</span>
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask search engines not to index this page.</span>
                                </span>
                            </label>

                            <label className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:bg-accent',
                                isPageCreateBusy && 'cursor-not-allowed opacity-70',
                            )}>
                                <input
                                    type="checkbox"
                                    checked={formData.noFollow}
                                    onChange={(event) => updatePageDraft({ noFollow: event.target.checked })}
                                    disabled={isPageCreateBusy}
                                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                                />
                                <span>
                                    <span className="block text-sm font-semibold">No follow</span>
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask search engines not to follow links from this page.</span>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div id="page-design" className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
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

                        <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-4" data-testid="page-create-dataset-selector">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-cyan-950">Collection dataset page</h3>
                                    <p className="mt-1 text-xs leading-5 text-cyan-900">
                                        Choose a collection to seed this page with reusable dataset bindings for repeaters, detail routes, media fields, and custom frontend APIs.
                                    </p>
                                </div>
                                <span className="w-fit rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-cyan-900">
                                    {collectionsLoading ? 'Loading collections' : `${collections.length} collection${collections.length === 1 ? '' : 's'}`}
                                </span>
                            </div>

                            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                                <div>
                                    <label htmlFor="page-dataset-collection-select" className="mb-2 block text-sm font-medium text-cyan-950">
                                        Dataset collection
                                    </label>
                                    <select
                                        id="page-dataset-collection-select"
                                        value={selectedDatasetCollection?.id || ''}
                                        onChange={(event) => handleDatasetCollectionChange(event.target.value)}
                                        disabled={isPageCreateBusy || collectionsLoading || !canViewCollections}
                                        title={!canViewCollections ? collectionsViewPermissionTitle : undefined}
                                        data-testid="page-dataset-collection-select"
                                        className="w-full rounded-lg border border-cyan-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <option value="">No dataset seed</option>
                                        {collections.map((collection) => (
                                            <option key={collection.id} value={collection.id}>
                                                {collection.name} /{collection.slug} ({collection.fields.length} fields)
                                            </option>
                                        ))}
                                    </select>
                                    <div className="mt-2 text-xs leading-5 text-cyan-900/80">
                                        {!canViewCollections
                                            ? collectionsViewPermissionTitle || 'Your account cannot view collections.'
                                            : collectionsError
                                                ? collectionsError
                                                : selectedDatasetCollection
                                                    ? `${selectedDatasetCollection.name} will seed ${selectedDatasetCollection.fields.length} mapped field${selectedDatasetCollection.fields.length === 1 ? '' : 's'}.`
                                                    : 'Leave empty for a normal page template.'}
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 text-sm font-medium text-cyan-950">Dataset mode</div>
                                    <div className="grid gap-2">
                                        {(['list', 'item'] as PageDatasetMode[]).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => handleDatasetModeChange(mode)}
                                                disabled={isPageCreateBusy || !formData.collectionId}
                                                data-testid={`page-dataset-mode-${mode}`}
                                                data-active={selectedDatasetMode === mode ? 'true' : 'false'}
                                                className={cn(
                                                    'rounded-lg border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                                                    selectedDatasetMode === mode
                                                        ? 'border-cyan-700 bg-white text-cyan-950 ring-1 ring-cyan-700'
                                                        : 'border-cyan-200 bg-white/80 text-cyan-900 hover:border-cyan-400',
                                                )}
                                            >
                                                {mode === 'list' ? 'List page' : 'Detail page'}
                                                <span className="mt-0.5 block text-xs font-normal text-cyan-900/70">
                                                    {mode === 'list' ? 'Repeater and index route' : 'Single-record route template'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {selectedDatasetCollection && selectedDatasetFields && (
                                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4" data-testid="page-dataset-field-map">
                                    <div className="rounded-md bg-white/80 px-2 py-1">collection {selectedDatasetCollection.slug}</div>
                                    <div className="rounded-md bg-white/80 px-2 py-1">mode {selectedDatasetMode || 'list'}</div>
                                    <div className="rounded-md bg-white/80 px-2 py-1">title {selectedDatasetFields.titleField?.key || 'unmapped'}</div>
                                    <div className="rounded-md bg-white/80 px-2 py-1">media {selectedDatasetFields.imageField?.key || 'unmapped'}</div>
                                </div>
                            )}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {frontendPageTemplates.length > 0 && (
                                <div className="md:col-span-2 xl:col-span-3 rounded-lg border border-teal-200 bg-teal-50/60 p-4" data-testid="page-frontend-template-options">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-semibold text-teal-950">Frontend design templates</h3>
                                            <p className="mt-1 text-xs leading-5 text-teal-900">
                                                Use templates captured from this site&apos;s custom frontend contract.
                                            </p>
                                        </div>
                                        <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-teal-900">
                                            {frontendDesign?.source.label || frontendDesign?.source.type || 'Connected design'}
                                        </span>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {frontendPageTemplates.map((template) => (
                                            <button
                                                key={template.id}
                                                type="button"
                                                onClick={() => handleFrontendTemplateChange(template)}
                                                disabled={isPageCreateBusy}
                                                data-testid={`page-frontend-template-${template.id}`}
                                                data-active={formData.designTemplateId === template.id}
                                                className={cn(
                                                    'rounded-lg border bg-white p-3 text-left transition hover:border-teal-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70',
                                                    formData.designTemplateId === template.id ? 'border-teal-600 ring-1 ring-teal-600' : 'border-teal-200',
                                                )}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-sm font-semibold text-foreground">{template.name}</span>
                                                    <span className="shrink-0 rounded-md bg-teal-100 px-2 py-1 text-[11px] font-semibold text-teal-800">
                                                        {template.canvasSize ? `${template.canvasSize.width} x ${template.canvasSize.height}` : 'Contract'}
                                                    </span>
                                                </div>
                                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                                    {template.description || template.routePattern || 'Captured template with editable frontend bindings.'}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                                                    <span className="rounded-md bg-muted px-2 py-1">{template.bindingHints?.length || 0} bindings</span>
                                                    {template.routePattern && <span className="rounded-md bg-muted px-2 py-1">{template.routePattern}</span>}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {frontendDesignLoading && (
                                <div className="md:col-span-2 xl:col-span-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                                    Loading frontend design templates...
                                </div>
                            )}
                            {frontendDesignError && (
                                <div className="md:col-span-2 xl:col-span-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    {frontendDesignError}
                                </div>
                            )}
                            {TEMPLATE_OPTIONS.map((tmpl) => (
                                    <label
                                        key={tmpl.id}
                                        className={cn(
                                            'flex cursor-pointer flex-col rounded-lg border p-3 transition-all hover:shadow-sm',
                                            formData.template === tmpl.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50',
                                            isPageCreateBusy && 'cursor-not-allowed opacity-70'
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="template"
                                            value={tmpl.id}
                                            checked={formData.template === tmpl.id}
                                            onChange={(e) => handleTemplateChange(e.target.value as PageTemplate)}
                                            disabled={isPageCreateBusy}
                                            className="sr-only"
                                        />
                                        <div className="mb-1 flex items-center gap-2">
                                            <Layout className={cn(
                                                'h-4 w-4',
                                                formData.template === tmpl.id ? 'text-primary' : 'text-muted-foreground'
                                            )} />
                                            <span className="font-semibold">{tmpl.name}</span>
                                        </div>
                                        <TemplateVisualPreview template={tmpl.id} active={formData.template === tmpl.id} />
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

                        <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.9fr)]">
                            <TemplateVisualPreview template={formData.template} active={true} size="large" testId="page-selected-template-preview" />
                            <div className="space-y-3">
                                <div>
                                    <div className="text-sm font-semibold text-foreground">{selectedTemplate.name} canvas seed</div>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedTemplate.detail}</p>
                                </div>
                                <dl className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-1">
                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                        <dt className="font-medium text-muted-foreground">Canvas</dt>
                                        <dd className="mt-1 font-semibold text-foreground">{effectiveCanvasSize.width} x {effectiveCanvasSize.height}</dd>
                                    </div>
                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                        <dt className="font-medium text-muted-foreground">Chrome</dt>
                                        <dd className="mt-1 font-semibold text-foreground">{selectedFrontendTemplate ? 'Frontend contract' : formData.template === 'blank' ? 'Library only' : 'Header, nav, footer'}</dd>
                                    </div>
                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                        <dt className="font-medium text-muted-foreground">Blocks</dt>
                                        <dd className="mt-1 font-semibold text-foreground">{selectedFrontendTemplate ? `${selectedFrontendTemplate.bindingHints?.length || 0} bindings` : `${selectedTemplate.sections.length} starter sections`}</dd>
                                    </div>
                                </dl>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="page-status" className="mb-2 block text-sm font-medium">Status</label>
	                                <select
	                                    id="page-status"
	                                    value={formData.status}
                                    onChange={(e) => {
                                        const status = e.target.value as typeof formData.status;
                                        updatePageDraft({
                                            status,
                                            scheduledAt: status === 'scheduled' ? formData.scheduledAt : null,
                                        });
                                    }}
	                                    disabled={isPageCreateBusy}
	                                    title={!canPublishPages && formData.status !== 'draft' ? publishPermissionTitle : undefined}
	                                    className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
	                                >
	                                    <option value="draft">Draft</option>
	                                    <option value="published" disabled={!canPublishPages}>Published</option>
	                                    <option value="scheduled" disabled={!canPublishPages}>Scheduled</option>
                                </select>
                            </div>

                            {formData.status === 'scheduled' && (
                                <div>
                                    <label htmlFor="page-scheduled-at" className="mb-2 block text-sm font-medium">Publish date</label>
                                    <input
                                        id="page-scheduled-at"
                                        type="datetime-local"
                                        value={toDateTimeLocalValue(formData.scheduledAt)}
                                        min={minimumScheduledAt}
                                        onChange={(e) => updatePageDraft({
                                            scheduledAt: fromDateTimeLocalValue(e.target.value),
                                        })}
                                        disabled={isPageCreateBusy}
                                        aria-invalid={Boolean(scheduleValidationMessage)}
                                        className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        required
                                    />
                                    {scheduleValidationMessage && (
                                        <p className="mt-2 text-xs text-destructive">{scheduleValidationMessage}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        {submitBlockerMessage && (
                            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <div>
                                    <div className="font-semibold">Create is blocked</div>
                                    <div className="mt-0.5">{submitBlockerMessage}</div>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isPageCreateBusy) return;
                                    navigate({ to: '/pages', search: { siteId: formData.siteId } });
                                }}
                                disabled={isPageCreateBusy}
                                className="rounded-lg border px-6 py-2.5 font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isPageCreateBusy || !canSubmit}
                                title={submitBlockerMessage || 'Create page and open the visual editor'}
                                aria-disabled={isPageCreateBusy || !canSubmit}
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-lg px-6 py-2.5',
                                    'bg-primary text-primary-foreground font-medium',
                                    'shadow-md hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
                                )}
                            >
                                <Save className="w-4 h-4" />
                                {isLoading ? 'Creating...' : isCheckingPages ? 'Checking routes...' : 'Create Page'}
                            </button>
                        </div>
                    </div>
                </form>

                <aside className="min-w-0 space-y-4">
                    <section id="page-preview" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
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
                        {routeConflict && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                {routeConflict.message}
                            </div>
                        )}
                        <dl className="mt-4 space-y-3 text-sm">
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Template</dt>
                                <dd className="mt-1 font-semibold text-foreground">{effectiveTemplateName}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Canvas</dt>
                                <dd className="mt-1 text-foreground">{effectiveCanvasSize.width} x {effectiveCanvasSize.height}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                                <dd className="mt-1 capitalize text-foreground">{formData.status}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Availability</dt>
                                <dd className={cn('mt-1 font-medium', routeConflict ? 'text-amber-700' : 'text-emerald-700')}>
                                    {routeConflict ? 'Route conflict' : `${selectedSitePages.length} page${selectedSitePages.length === 1 ? '' : 's'} and ${collections.length} collection${collections.length === 1 ? '' : 's'} checked`}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Layout className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">{effectiveTemplateName}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {selectedFrontendTemplate?.description || selectedTemplate.detail}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2">
                            {(selectedFrontendTemplate
                                ? [
                                    `${selectedFrontendTemplate.bindingHints?.length || 0} editable bindings`,
                                    selectedFrontendTemplate.routePattern || 'Frontend route pattern',
                                    frontendDesign?.source.label || frontendDesign?.source.type || 'Frontend design source',
                                ]
                                : selectedTemplate.sections
                            ).map((section) => (
                                <div key={section} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                    {section}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section id="page-payload" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
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
{JSON.stringify(createPayloadPreview, null, 2)}
                        </pre>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void copyCreationText(adminPagesUrl, 'Page create API URL')}
                                disabled={isPageCreateBusy}
                                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Copy className="h-4 w-4" />
                                Copy URL
                            </button>
                            <button
                                type="button"
                                onClick={() => void copyCreationText(creationHandoffText, 'Page creation handoff manifest')}
                                disabled={isPageCreateBusy}
                                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Copy className="h-4 w-4" />
                                Copy handoff
                            </button>
                        </div>
                    </section>
                </aside>
            </div>
        </PageShell>
    );
}

function PageCreationCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
    const Icon = ready ? CheckCircle2 : AlertTriangle;

    return (
        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function PageCreationWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                {index}
            </span>
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function TemplateVisualPreview({
    template,
    active,
    size = 'card',
    testId,
}: {
    template: PageTemplate;
    active: boolean;
    size?: 'card' | 'large';
    testId?: string;
}) {
    const hasChrome = template !== 'blank';
    const blocks = templatePreviewBlocks[template];

    return (
        <div
            data-testid={testId || `page-template-preview-${template}`}
            data-active={active ? 'true' : 'false'}
            data-template={template}
            data-block-count={blocks.length}
            className={cn(
                'my-3 overflow-hidden rounded-lg border bg-background shadow-sm',
                active ? 'border-primary/50' : 'border-border',
            )}
        >
            <div className={cn('relative overflow-hidden bg-slate-50', size === 'large' ? 'h-44' : 'h-28')}>
                <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(#e2e8f0_1px,transparent_1px),linear-gradient(90deg,#e2e8f0_1px,transparent_1px)] [background-size:12px_12px]" />
                {hasChrome && (
                    <>
                        <div className="absolute left-2 right-2 top-2 flex h-5 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            <span className="h-1.5 w-8 rounded-full bg-slate-300" />
                            <span className="ml-auto h-1.5 w-5 rounded-full bg-slate-200" />
                            <span className="h-1.5 w-5 rounded-full bg-slate-200" />
                        </div>
                        <div className="absolute bottom-2 left-2 right-2 h-4 rounded-md border border-slate-200 bg-white/90" />
                    </>
                )}
                {blocks.map((block, index) => (
                    <div
                        key={`${template}-preview-${index}`}
                        className={cn(
                            'absolute rounded-md border text-[9px] font-semibold leading-none text-slate-700 shadow-sm',
                            block.className,
                        )}
                        style={{
                            left: `${block.x}%`,
                            top: `${block.y}%`,
                            width: `${block.w}%`,
                            height: `${block.h}%`,
                        }}
                    >
                        {block.label && (
                            <span className="absolute left-1 top-1 rounded bg-white/85 px-1 py-0.5">{block.label}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

const isRecoverablePageCreateDraft = (value: Partial<PageCreateAutosaveDraft>): value is PageCreateAutosaveDraft => {
    const formData = value.formData;

    return (
        value.version === 1
        && typeof value.savedAt === 'string'
        && Boolean(formData)
        && typeof formData?.title === 'string'
        && typeof formData.slug === 'string'
        && typeof formData.siteId === 'string'
        && isPageTemplate(formData.template)
        && isPageCreationStatus(formData.status)
        && (typeof formData.scheduledAt === 'string' || formData.scheduledAt === null)
        && typeof formData.isHomepage === 'boolean'
        && typeof formData.description === 'string'
        && typeof formData.parentPageId === 'string'
        && isPageNavigationPlacement(formData.navigationPlacement)
        && typeof formData.navigationLabel === 'string'
        && typeof formData.seoTitle === 'string'
        && typeof formData.canonicalPath === 'string'
        && typeof formData.keywords === 'string'
        && typeof formData.jsonLdText === 'string'
        && typeof formData.ogImage === 'string'
        && typeof formData.noIndex === 'boolean'
        && typeof formData.noFollow === 'boolean'
        && (formData.designTemplateId === undefined || typeof formData.designTemplateId === 'string')
        && (formData.collectionId === undefined || typeof formData.collectionId === 'string')
        && (formData.datasetMode === undefined || formData.datasetMode === '' || isPageDatasetMode(formData.datasetMode))
    );
};

async function applyPageNavigationPlacement(input: {
    siteId: string;
    page: Page;
    placement: PageNavigationPlacement;
    label: string;
    parentPage: Page | null;
}) {
    if (input.placement === 'none') {
        return;
    }

    const currentNavigation = await getSiteNavigation(input.siteId);
    const nextNavigation = appendPageToNavigation(
        currentNavigation.settings,
        input.placement,
        input.page,
        input.label,
        input.parentPage,
    );

    await updateSiteNavigation(input.siteId, nextNavigation);
}

function appendPageToNavigation(
    navigation: SiteNavigationConfig,
    placement: Exclude<PageNavigationPlacement, 'none'>,
    page: Page,
    label: string,
    parentPage: Page | null,
): SiteNavigationConfig {
    const stripPageItem = (items: SiteNavigationConfigItem[] | undefined): SiteNavigationConfigItem[] => (
        (items || [])
            .filter((item) => item.pageId !== page.id)
            .map((item) => ({
                ...item,
                children: stripPageItem(item.children),
            }))
    );
    const nextItem: SiteNavigationConfigItem = {
        id: `nav_page_${page.id}`,
        type: 'page',
        label: label.trim() || page.title,
        pageId: page.id,
        target: '_self',
        visible: true,
        children: [],
    };
    const nextPrimary = stripPageItem(navigation.primary);
    const nextFooter = stripPageItem(navigation.footer);
    const parentItem = parentPage
        ? {
            id: `nav_page_${parentPage.id}`,
            type: 'page' as const,
            label: parentPage.title,
            pageId: parentPage.id,
            target: '_self' as const,
            visible: true,
            children: [],
        }
        : null;
    const insertAsChild = (items: SiteNavigationConfigItem[]): { items: SiteNavigationConfigItem[]; inserted: boolean } => {
        if (!parentItem) {
            return { items, inserted: false };
        }

        let inserted = false;
        const nextItems = items.map((item) => {
            const childResult = insertAsChild(item.children || []);

            if (item.pageId === parentItem.pageId) {
                inserted = true;
                return {
                    ...item,
                    children: [...stripPageItem(item.children), nextItem],
                };
            }

            if (childResult.inserted) {
                inserted = true;
                return {
                    ...item,
                    children: childResult.items,
                };
            }

            return item;
        });

        return { items: nextItems, inserted };
    };
    const ensureParentWithChild = (items: SiteNavigationConfigItem[]) => {
        if (!parentItem) return [...items, nextItem];
        const result = insertAsChild(items);
        if (result.inserted) return result.items;
        return [...items, { ...parentItem, children: [nextItem] }];
    };

    if (placement === 'primary') {
        const primary = page.isHomepage ? [nextItem, ...nextPrimary] : ensureParentWithChild(nextPrimary);
        return {
            ...navigation,
            primary,
            footer: nextFooter,
        };
    }

    return {
        ...navigation,
        primary: nextPrimary,
        footer: ensureParentWithChild(nextFooter),
    };
}

function createInitialPageContent(input: {
    template: PageTemplate;
    frontendTemplate?: SiteFrontendDesignTemplate | null;
    frontendDesign?: SiteFrontendDesignContract | null;
    datasetCollection?: Collection | null;
    datasetMode?: PageDatasetMode;
    title: string;
    slug: string;
    status: 'draft' | 'published' | 'scheduled';
    description: string;
}) {
    const elements = input.frontendTemplate
        ? buildFrontendTemplateElements(input.frontendTemplate, input)
        : input.datasetCollection
            ? buildCollectionDatasetPageElements(input.datasetCollection, input.datasetMode || 'list', input)
        : buildTemplateElements(input);
    const canvasSize = input.frontendTemplate?.canvasSize
        ? {
            ...DEFAULT_CANVAS_SIZE,
            width: input.frontendTemplate.canvasSize.width,
            height: input.frontendTemplate.canvasSize.height,
        }
        : {
            ...DEFAULT_CANVAS_SIZE,
            height: getCanvasHeightForElements(elements),
        };
    const customCSS = input.frontendTemplate
        ? input.frontendDesign?.tokens?.customCss
        : undefined;

    return JSON.parse(serializeCanvasContent(elements, {
        ...canvasSize,
        height: Math.max(canvasSize.height, getCanvasHeightForElements(elements)),
    }, customCSS, {
        documentId: `page_${input.slug || 'new-page'}`,
        kind: 'page',
        title: input.title,
        slug: input.slug,
        status: input.status,
        locale: 'en',
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COLLECTION_DATASET_TEXT_FIELD_TYPES: CollectionFieldType[] = ['text', 'richText', 'slug', 'url', 'email', 'phone', 'select', 'tags'];
const COLLECTION_DATASET_MEDIA_FIELD_TYPES: CollectionFieldType[] = ['image', 'video', 'file'];

const findPageCollectionDatasetField = (
    fields: CollectionField[],
    preferredKeys: string[],
    allowedTypes?: CollectionFieldType[],
) => {
    const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
    const preferred = sorted.find((field) => (
        preferredKeys.includes(field.key.toLowerCase()) &&
        (!allowedTypes || allowedTypes.includes(field.type))
    ));
    if (preferred) return preferred;

    return sorted.find((field) => !allowedTypes || allowedTypes.includes(field.type)) || null;
};

const buildPageCollectionDatasetFields = (collection: Collection) => ({
    titleField: findPageCollectionDatasetField(collection.fields, ['title', 'name', 'headline', 'label'], COLLECTION_DATASET_TEXT_FIELD_TYPES),
    descriptionField: findPageCollectionDatasetField(collection.fields, ['summary', 'description', 'excerpt', 'body'], COLLECTION_DATASET_TEXT_FIELD_TYPES),
    imageField: findPageCollectionDatasetField(collection.fields, ['image', 'photo', 'thumbnail', 'cover', 'avatar'], COLLECTION_DATASET_MEDIA_FIELD_TYPES),
});

const normalizeCollectionDatasetListPath = (collection: Collection) => {
    const raw = collection.listRoutePattern?.trim() || `/${collection.slug}`;
    const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || `/${collection.slug}`;
};

const normalizeCollectionDatasetItemPath = (collection: Collection) => {
    const raw = collection.routePattern?.trim() || `/${collection.slug}/:recordSlug`;
    const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withLeadingSlash
        .replace(/\/{2,}/g, '/')
        .replace(':collectionSlug', collection.slug)
        .replace(':recordSlug', '{recordSlug}')
        .replace(/\/$/, '');
};

function buildCollectionDatasetPageElements(
    collection: Collection,
    mode: PageDatasetMode,
    input: { title: string; slug: string; description: string },
): CanvasElement[] {
    const fields = buildPageCollectionDatasetFields(collection);
    const titleField = fields.titleField?.key || collection.fields[0]?.key || 'title';
    const descriptionField = fields.descriptionField?.key || titleField;
    const routeLabel = mode === 'item'
        ? normalizeCollectionDatasetItemPath(collection)
        : normalizeCollectionDatasetListPath(collection);
    const baseDataset = {
        kind: 'collection',
        collectionId: collection.id,
        collectionSlug: collection.slug,
        datasetId: `dataset_${collection.id}`,
        mode,
    };

    if (mode === 'item') {
        return withPageChrome([
            createCanvasElement('section', 0, 0, {
                id: `collection-${collection.id}-detail-section`,
                width: DEFAULT_CANVAS_SIZE.width,
                height: 700,
                props: {
                    backgroundColor: '#ffffff',
                    borderRadius: 0,
                    datasetImport: baseDataset,
                },
                children: [
                    createCanvasElement('text', 76, 64, {
                        id: `collection-${collection.id}-route-label`,
                        width: 620,
                        height: 28,
                        props: {
                            content: routeLabel,
                            fontSize: 13,
                            color: '#0f766e',
                            fontWeight: '700',
                        },
                    }),
                    createCanvasElement('heading', 72, 112, {
                        id: `collection-${collection.id}-detail-title`,
                        width: 720,
                        height: 100,
                        props: {
                            content: input.title || `${collection.name} detail`,
                            level: 'h1',
                            fontSize: 54,
                            fontWeight: '800',
                            lineHeight: 1.05,
                            color: '#111827',
                        },
                        dataBindings: [{
                            id: `bind_collection_${collection.id}_title`,
                            datasetId: `dataset_${collection.id}`,
                            targetPath: 'props.content',
                            source: { kind: 'collection', collectionId: collection.id, field: titleField },
                            mode: 'text',
                            pagination: { limit: 1 },
                        }],
                    }),
                    createCanvasElement('paragraph', 76, 236, {
                        id: `collection-${collection.id}-detail-summary`,
                        width: 650,
                        height: 124,
                        props: {
                            content: input.description || collection.description || `Design a dynamic detail view for ${collection.name}.`,
                            fontSize: 18,
                            lineHeight: 1.6,
                            color: '#4b5563',
                        },
                        dataBindings: [{
                            id: `bind_collection_${collection.id}_summary`,
                            datasetId: `dataset_${collection.id}`,
                            targetPath: 'props.content',
                            source: { kind: 'collection', collectionId: collection.id, field: descriptionField },
                            mode: 'richText',
                            pagination: { limit: 1 },
                        }],
                    }),
                    createCanvasElement('box', 770, 108, {
                        id: `collection-${collection.id}-detail-card`,
                        width: 360,
                        height: 360,
                        props: {
                            backgroundColor: '#f8fafc',
                            borderColor: '#cbd5e1',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            borderRadius: 8,
                        },
                        children: [
                            createCanvasElement('paragraph', 28, 30, {
                                id: `collection-${collection.id}-detail-fields`,
                                width: 292,
                                height: 260,
                                props: {
                                    content: collection.fields.slice(0, 8).map((field) => `${field.label}: record.${field.key}`).join('\n'),
                                    fontSize: 15,
                                    lineHeight: 1.7,
                                    color: '#334155',
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ], {
            title: input.title || `${collection.name} detail`,
            variant: `collection-${collection.slug}-detail`,
            navItems: ['Home', collection.name, 'Contact'],
            headerActionLabel: 'Edit content',
        });
    }

    return withPageChrome([
        createCanvasElement('section', 0, 0, {
            id: `collection-${collection.id}-list-section`,
            width: DEFAULT_CANVAS_SIZE.width,
            height: 760,
            props: {
                backgroundColor: '#ffffff',
                borderRadius: 0,
                datasetImport: baseDataset,
            },
            children: [
                createCanvasElement('text', 76, 60, {
                    id: `collection-${collection.id}-list-route`,
                    width: 600,
                    height: 28,
                    props: {
                        content: routeLabel,
                        fontSize: 13,
                        color: '#0f766e',
                        fontWeight: '700',
                    },
                }),
                createCanvasElement('heading', 72, 108, {
                    id: `collection-${collection.id}-list-title`,
                    width: 760,
                    height: 84,
                    props: {
                        content: input.title || collection.name,
                        level: 'h1',
                        fontSize: 52,
                        fontWeight: '800',
                        lineHeight: 1.05,
                        color: '#111827',
                    },
                }),
                createCanvasElement('paragraph', 76, 212, {
                    id: `collection-${collection.id}-list-intro`,
                    width: 720,
                    height: 84,
                    props: {
                        content: input.description || collection.description || `Browse and manage ${collection.name.toLowerCase()} records from Backy.`,
                        fontSize: 18,
                        lineHeight: 1.55,
                        color: '#4b5563',
                    },
                }),
                createCanvasElement('repeater', 72, 340, {
                    id: `collection-${collection.id}-repeater`,
                    width: 1056,
                    height: 330,
                    props: {
                        collectionId: collection.id,
                        datasetId: `dataset_${collection.id}`,
                        titleField,
                        descriptionField,
                        ...(fields.imageField ? { imageField: fields.imageField.key } : {}),
                        query: { sortBy: 'updatedAt', sortDirection: 'desc' },
                        limit: 9,
                        columns: 3,
                        gap: 16,
                        emptyMessage: `No ${collection.name.toLowerCase()} records yet.`,
                        backgroundColor: '#f8fafc',
                        borderRadius: 8,
                        padding: 16,
                    },
                }),
            ],
        }),
    ], {
        title: input.title || collection.name,
        variant: `collection-${collection.slug}-list`,
        navItems: ['Home', collection.name, 'Contact'],
        headerActionLabel: 'Add record',
    });
}

function buildFrontendTemplateElements(
    template: SiteFrontendDesignTemplate,
    input: { title: string; slug: string; description: string },
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
            id: `frontend-template-${template.id}`,
            width: canvasWidth,
            height: Math.max(620, canvasHeight - 160),
            props: {
                backgroundColor: '#ffffff',
                borderRadius: 0,
                padding: 0,
                frontendTemplateId: template.id,
                frontendTemplateName: template.name,
                routePattern: template.routePattern,
            },
            children: [
                createCanvasElement('heading', 72, 72, {
                    id: `frontend-template-${template.id}-heading`,
                    width: Math.min(720, canvasWidth - 144),
                    height: 96,
                    props: {
                        content: input.title || template.name,
                        level: 'h1',
                        fontSize: 48,
                        fontWeight: '800',
                        lineHeight: 1.1,
                        color: '#111827',
                        binding: 'page.title',
                    },
                }),
                createCanvasElement('paragraph', 76, 190, {
                    id: `frontend-template-${template.id}-description`,
                    width: Math.min(680, canvasWidth - 152),
                    height: 96,
                    props: {
                        content: input.description || template.description || 'This page was seeded from the connected frontend design contract.',
                        fontSize: 18,
                        lineHeight: 1.6,
                        color: '#4b5563',
                        binding: 'page.description',
                    },
                }),
                createCanvasElement('box', 76, 340, {
                    id: `frontend-template-${template.id}-editable-region`,
                    width: Math.min(860, canvasWidth - 152),
                    height: 180,
                    props: {
                        backgroundColor: '#f8fafc',
                        borderColor: '#cbd5e1',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderRadius: 8,
                        bindingHints: template.bindingHints || [],
                    },
                    children: [
                        createCanvasElement('paragraph', 28, 30, {
                            id: `frontend-template-${template.id}-editable-region-copy`,
                            width: Math.min(760, canvasWidth - 220),
                            height: 80,
                            props: {
                                content: 'Replace this placeholder with captured component content, mapped fields, or reusable sections.',
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

function buildTemplateElements(input: {
    template: PageTemplate;
    title: string;
    slug?: string;
    description: string;
}): CanvasElement[] {
    const title = input.title || 'New page';
    const description = input.description || 'Use this space to explain the promise of this page and guide visitors to the next action.';
    const formSlug = slugify(input.slug || title || 'new-page');
    const withChrome = (elements: CanvasElement[]) => withPageChrome(elements, {
        title,
        variant: input.template,
        navItems: templateNavigationItems[input.template],
        headerActionLabel: input.template === 'cart'
            ? 'Checkout'
            : input.template === 'checkout'
            ? 'Checkout'
            : input.template === 'order-confirmation'
                ? 'View order'
            : input.template === 'pricing'
                ? 'View plans'
            : input.template === 'services'
                ? 'Book now'
            : input.template === 'booking'
                ? 'Book now'
            : input.template === 'portfolio'
                ? 'View work'
            : input.template === 'gallery'
                ? 'View gallery'
            : input.template === 'events'
                ? 'RSVP'
            : input.template === 'privacy'
                ? 'Contact'
            : input.template === 'terms'
                ? 'Terms'
            : input.template === 'cookie-policy'
                ? 'Manage cookies'
            : input.template === 'accessibility-statement'
                ? 'Send feedback'
            : input.template === 'refund-policy'
                ? 'Start return'
            : input.template === 'shipping-policy'
                ? 'Track order'
            : input.template === 'newsletter'
                ? 'Subscribe'
            : input.template === 'survey'
                ? 'Start survey'
            : input.template === 'faq'
                ? 'Ask question'
            : input.template === 'testimonials'
                ? 'Read stories'
            : input.template === 'blog-post'
                ? 'Read article'
            : input.template === 'team'
                ? 'Meet team'
            : input.template === 'careers'
                ? 'View roles'
            : input.template === 'help-center'
                ? 'Get help'
            : ['storefront', 'product-detail'].includes(input.template) ? 'Shop now' : 'Contact',
    });

    if (input.template === 'landing') {
        return withChrome([
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
        ]);
    }

    if (input.template === 'storefront') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'storefront-hero-section',
                width: 1200,
                height: 380,
                dataBindings: [{ source: 'products', mode: 'featured', limit: 1 }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 72, 70, {
                        id: 'storefront-heading',
                        width: 520,
                        height: 112,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                    }),
                    createCanvasElement('paragraph', 76, 204, {
                        id: 'storefront-copy',
                        width: 500,
                        height: 78,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#4b5563' },
                    }),
                    createCanvasElement('button', 76, 306, {
                        id: 'storefront-shop-button',
                        width: 178,
                        height: 50,
                        props: { label: 'Shop products', href: '#products', backgroundColor: '#0f766e', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: '700' },
                    }),
                    createCanvasElement('box', 720, 54, {
                        id: 'storefront-featured-product',
                        width: 350,
                        height: 280,
                        dataBindings: [{ source: 'products', mode: 'featured', fields: ['title', 'price', 'image', 'slug'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#dbe3ea', borderWidth: 1, borderStyle: 'solid', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.10)' },
                        children: [
                            createCanvasElement('box', 24, 24, {
                                id: 'storefront-featured-media',
                                width: 302,
                                height: 150,
                                props: { backgroundColor: '#e6f3f1', borderRadius: 8 },
                            }),
                            createCanvasElement('heading', 24, 196, {
                                id: 'storefront-featured-title',
                                width: 220,
                                height: 30,
                                props: { content: 'Featured product', level: 'h3', fontSize: 20, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('text', 24, 234, {
                                id: 'storefront-featured-price',
                                width: 120,
                                height: 26,
                                props: { content: '$49', fontSize: 17, fontWeight: '700', color: '#0f766e' },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 380, {
                id: 'storefront-products-section',
                width: 1200,
                height: 380,
                dataBindings: [{ source: 'products', mode: 'list', limit: 6, sort: 'manual' }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 72, 50, {
                        id: 'storefront-products-heading',
                        width: 420,
                        height: 46,
                        props: { content: 'Product catalog', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                    }),
                    ...['Digital kit', 'Service package', 'Featured item'].map((item, index) => createCanvasElement('box', 72 + index * 360, 132, {
                        id: `storefront-product-card-${index}`,
                        width: 318,
                        height: 198,
                        dataBindings: [{ source: 'products', mode: 'item', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 20, 22, {
                                id: `storefront-product-title-${index}`,
                                width: 230,
                                height: 34,
                                props: { content: item, level: 'h3', fontSize: 21, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 20, 70, {
                                id: `storefront-product-copy-${index}`,
                                width: 240,
                                height: 54,
                                props: { content: 'Bind this card to product title, media, price, and detail URL.', fontSize: 14, lineHeight: 1.45, color: '#4b5563' },
                            }),
                            createCanvasElement('button', 20, 142, {
                                id: `storefront-product-button-${index}`,
                                width: 128,
                                height: 38,
                                props: { label: 'View item', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontSize: 14, fontWeight: '700' },
                            }),
                        ],
                    })),
                ],
            }),
        ]);
    }

    if (input.template === 'product-detail') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'product-detail-hero-section',
                width: 1200,
                height: 640,
                dataBindings: [{ source: 'products', mode: 'detail', fields: ['title', 'description', 'price', 'image', 'inventory', 'slug'] }],
                props: { backgroundColor: '#fff7ed', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 760 },
                    mobile: { width: 375, height: 820 },
                },
                children: [
                    createCanvasElement('box', 72, 72, {
                        id: 'product-detail-media',
                        width: 500,
                        height: 430,
                        dataBindings: [{ source: 'products', mode: 'detail', field: 'image' }],
                        props: { backgroundColor: '#ffedd5', borderRadius: 8, borderColor: '#fed7aa', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 72, width: 300, height: 300 },
                            mobile: { x: 24, y: 76, width: 327, height: 240 },
                        },
                        children: [
                            createCanvasElement('text', 36, 36, {
                                id: 'product-detail-media-label',
                                width: 220,
                                height: 28,
                                props: { content: 'Product media', fontSize: 13, fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' },
                            }),
                        ],
                    }),
                    createCanvasElement('text', 650, 78, {
                        id: 'product-detail-kicker',
                        width: 240,
                        height: 28,
                        props: { content: 'Featured product', fontSize: 13, fontWeight: '800', color: '#c2410c', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 394, y: 82, width: 220 },
                            mobile: { x: 26, y: 352, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 646, 116, {
                        id: 'product-detail-heading',
                        width: 430,
                        height: 100,
                        props: { content: title, level: 'h1', fontSize: 48, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        dataBindings: [{ source: 'products', mode: 'detail', field: 'title', targetPath: 'props.content' }],
                        responsive: {
                            tablet: { x: 390, y: 120, width: 310, height: 110, props: { fontSize: 36 } },
                            mobile: { x: 24, y: 388, width: 327, height: 112, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 650, 236, {
                        id: 'product-detail-copy',
                        width: 430,
                        height: 104,
                        props: { content: description, fontSize: 17, lineHeight: 1.58, color: '#4b5563' },
                        dataBindings: [{ source: 'products', mode: 'detail', field: 'description', targetPath: 'props.content' }],
                        responsive: {
                            tablet: { x: 394, y: 250, width: 310, height: 142, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 514, width: 323, height: 126, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('text', 650, 362, {
                        id: 'product-detail-price',
                        width: 160,
                        height: 38,
                        props: { content: '$49', fontSize: 28, fontWeight: '800', color: '#0f766e' },
                        dataBindings: [{ source: 'products', mode: 'detail', field: 'price', targetPath: 'props.content' }],
                        responsive: {
                            tablet: { x: 394, y: 414, width: 150 },
                            mobile: { x: 26, y: 662, width: 140 },
                        },
                    }),
                    createCanvasElement('select', 650, 422, {
                        id: 'product-detail-option',
                        width: 240,
                        height: 54,
                        props: { label: 'Option', name: 'option', options: ['Standard', 'Premium', 'Bundle'], placeholder: 'Choose an option' },
                        responsive: {
                            tablet: { x: 394, y: 474, width: 240 },
                            mobile: { x: 26, y: 708, width: 200 },
                        },
                    }),
                    createCanvasElement('button', 650, 506, {
                        id: 'product-detail-buy-button',
                        width: 180,
                        height: 52,
                        props: { label: 'Buy now', backgroundColor: '#c2410c', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: '800', action: 'commerce.checkout' },
                        responsive: {
                            tablet: { x: 394, y: 548, width: 168 },
                            mobile: { x: 26, y: 776, width: 154 },
                        },
                    }),
                    createCanvasElement('text', 850, 520, {
                        id: 'product-detail-stock',
                        width: 170,
                        height: 28,
                        props: { content: 'In stock', fontSize: 14, fontWeight: '700', color: '#15803d' },
                        dataBindings: [{ source: 'products', mode: 'detail', field: 'inventory', targetPath: 'props.content' }],
                        responsive: {
                            tablet: { x: 578, y: 560, width: 130 },
                            mobile: { x: 198, y: 788, width: 124 },
                        },
                    }),
                ],
            }),
            createCanvasElement('section', 0, 640, {
                id: 'product-detail-related-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'products', mode: 'related', limit: 3 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 760, width: 768, height: 360 },
                    mobile: { y: 820, width: 375, height: 520 },
                },
                children: [
                    createCanvasElement('heading', 72, 48, {
                        id: 'product-detail-related-heading',
                        width: 420,
                        height: 44,
                        props: { content: 'Related products', level: 'h2', fontSize: 32, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 44, width: 360 },
                            mobile: { x: 24, y: 36, width: 310, props: { fontSize: 28 } },
                        },
                    }),
                    ...['Bundle add-on', 'Digital guide', 'Consultation'].map((item, index) => createCanvasElement('box', 72 + index * 360, 124, {
                        id: `product-detail-related-card-${index}`,
                        width: 318,
                        height: 128,
                        dataBindings: [{ source: 'products', mode: 'related', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54 + index * 230, y: 120, width: 196, height: 150 },
                            mobile: { x: 24, y: 102 + index * 126, width: 327, height: 104 },
                        },
                        children: [
                            createCanvasElement('heading', 20, 20, {
                                id: `product-detail-related-title-${index}`,
                                width: 220,
                                height: 30,
                                props: { content: item, level: 'h3', fontSize: 20, fontWeight: '750', color: '#111827' },
                                responsive: {
                                    tablet: { width: 150, props: { fontSize: 18 } },
                                    mobile: { width: 230, props: { fontSize: 18 } },
                                },
                            }),
                            createCanvasElement('text', 20, 66, {
                                id: `product-detail-related-price-${index}`,
                                width: 120,
                                height: 24,
                                props: { content: '$29', fontSize: 16, fontWeight: '800', color: '#0f766e' },
                            }),
                        ],
                    })),
                ],
            }),
        ]);
    }

    if (input.template === 'pricing') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'pricing-hero-section',
                width: 1200,
                height: 360,
                dataBindings: [{ source: 'commerce', mode: 'pricing', fields: ['plans', 'currency', 'billingIntervals'] }],
                props: { backgroundColor: '#f5f3ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 560 },
                },
                children: [
                    createCanvasElement('text', 76, 62, {
                        id: 'pricing-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Pricing', fontSize: 13, fontWeight: '800', color: '#6d28d9', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 100, {
                        id: 'pricing-heading',
                        width: 650,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 470, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 120, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 216, {
                        id: 'pricing-copy',
                        width: 590,
                        height: 72,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#4b5563' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 470, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 216, width: 323, height: 106, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 760, 104, {
                        id: 'pricing-billing-toggle',
                        width: 300,
                        height: 78,
                        dataBindings: [{ source: 'commerce', mode: 'billing-toggle', fields: ['monthly', 'annual'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#ddd6fe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 318, width: 300 },
                            mobile: { x: 24, y: 374, width: 327, height: 78 },
                        },
                        children: [
                            createCanvasElement('button', 16, 16, {
                                id: 'pricing-monthly-toggle',
                                width: 124,
                                height: 46,
                                props: { label: 'Monthly', backgroundColor: '#6d28d9', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'pricing.interval.monthly' },
                                responsive: {
                                    mobile: { width: 140 },
                                },
                            }),
                            createCanvasElement('button', 156, 16, {
                                id: 'pricing-annual-toggle',
                                width: 124,
                                height: 46,
                                props: { label: 'Annual', backgroundColor: '#f5f3ff', color: '#5b21b6', borderRadius: 8, fontWeight: '800', action: 'pricing.interval.annual' },
                                responsive: {
                                    mobile: { x: 170, width: 140 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 360, {
                id: 'pricing-plan-section',
                width: 1200,
                height: 430,
                dataBindings: [{ source: 'commerce', mode: 'pricing-plans', limit: 3 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 560, width: 375, height: 1130 },
                },
                children: [
                    ...[
                        { name: 'Starter', price: '$19', cta: 'Start starter' },
                        { name: 'Growth', price: '$49', cta: 'Start growth' },
                        { name: 'Scale', price: '$99', cta: 'Talk to sales' },
                    ].map((plan, index) => createCanvasElement('box', 72 + index * 360, 62, {
                        id: `pricing-plan-card-${index}`,
                        width: 318,
                        height: 300,
                        dataBindings: [{ source: 'commerce', mode: 'pricing-plan', index }],
                        props: {
                            backgroundColor: index === 1 ? '#111827' : '#f9fafb',
                            borderRadius: 8,
                            borderColor: index === 1 ? '#111827' : '#e5e7eb',
                            borderWidth: 1,
                            borderStyle: 'solid',
                        },
                        responsive: {
                            tablet: { x: 54, y: 48 + index * 340, width: 660, height: 292 },
                            mobile: { x: 24, y: 44 + index * 336, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `pricing-plan-name-${index}`,
                                width: 190,
                                height: 34,
                                props: { content: plan.name, level: 'h2', fontSize: 24, fontWeight: '800', color: index === 1 ? '#ffffff' : '#111827' },
                                dataBindings: [{ source: 'commerce', mode: 'pricing-plan', index, field: 'name', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 250 },
                                    mobile: { width: 220 },
                                },
                            }),
                            createCanvasElement('text', 24, 82, {
                                id: `pricing-plan-price-${index}`,
                                width: 130,
                                height: 42,
                                props: { content: plan.price, fontSize: 34, fontWeight: '800', color: index === 1 ? '#c4b5fd' : '#6d28d9' },
                                dataBindings: [{ source: 'commerce', mode: 'pricing-plan', index, field: 'price', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 142, {
                                id: `pricing-plan-features-${index}`,
                                width: 238,
                                height: 72,
                                props: { content: 'Includes hosted pages, CMS content, media library, commerce handoff, and editor controls.', fontSize: 14, lineHeight: 1.45, color: index === 1 ? '#d1d5db' : '#4b5563' },
                                responsive: {
                                    tablet: { width: 480 },
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('button', 24, 232, {
                                id: `pricing-plan-button-${index}`,
                                width: 166,
                                height: 48,
                                props: { label: plan.cta, backgroundColor: index === 1 ? '#8b5cf6' : '#111827', color: '#ffffff', borderRadius: 8, fontSize: 14, fontWeight: '800', action: 'commerce.checkout' },
                                responsive: {
                                    tablet: { x: 460, y: 222, width: 160 },
                                    mobile: { x: 24, y: 232, width: 166 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 790, {
                id: 'pricing-comparison-section',
                width: 1200,
                height: 370,
                dataBindings: [{ source: 'commerce', mode: 'pricing-features', limit: 8 }],
                props: { backgroundColor: '#f9fafb', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 600 },
                    mobile: { y: 1690, width: 375, height: 650 },
                },
                children: [
                    createCanvasElement('heading', 72, 52, {
                        id: 'pricing-comparison-heading',
                        width: 460,
                        height: 42,
                        props: { content: 'Compare plan features', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('box', 72, 126, {
                        id: 'pricing-comparison-table',
                        width: 720,
                        height: 176,
                        dataBindings: [{ source: 'commerce', mode: 'pricing-comparison', fields: ['feature', 'starter', 'growth', 'scale'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 126, width: 660, height: 176 },
                            mobile: { x: 24, y: 118, width: 327, height: 220 },
                        },
                        children: ['Pages and sites', 'Products and orders', 'Team seats'].map((feature, index) => createCanvasElement('box', 18, 18 + index * 52, {
                            id: `pricing-comparison-row-${index}`,
                            width: 682,
                            height: 42,
                            dataBindings: [{ source: 'commerce', mode: 'pricing-feature', index }],
                            props: { backgroundColor: '#ffffff', borderRadius: 8 },
                            responsive: {
                                tablet: { width: 624 },
                                mobile: { x: 14, y: 16 + index * 64, width: 299, height: 56 },
                            },
                            children: [
                                createCanvasElement('text', 18, 10, {
                                    id: `pricing-comparison-feature-${index}`,
                                    width: 240,
                                    height: 24,
                                    props: { content: feature, fontSize: 14, fontWeight: '800', color: '#111827' },
                                    responsive: {
                                        mobile: { x: 12, y: 8, width: 130 },
                                    },
                                }),
                                createCanvasElement('text', 342, 10, {
                                    id: `pricing-comparison-check-${index}`,
                                    width: 240,
                                    height: 24,
                                    props: { content: 'Included on Growth and Scale', fontSize: 14, color: '#4b5563' },
                                    responsive: {
                                        tablet: { x: 320, width: 260 },
                                        mobile: { x: 148, y: 8, width: 130 },
                                    },
                                }),
                            ],
                        })),
                    }),
                    createCanvasElement('box', 850, 126, {
                        id: 'pricing-faq-card',
                        width: 270,
                        height: 176,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 340, width: 660, height: 180 },
                            mobile: { x: 24, y: 380, width: 327, height: 190 },
                        },
                        children: [
                            createCanvasElement('heading', 22, 22, {
                                id: 'pricing-faq-heading',
                                width: 190,
                                height: 30,
                                props: { content: 'Pricing FAQ', level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    tablet: { width: 280 },
                                    mobile: { width: 250 },
                                },
                            }),
                            createCanvasElement('paragraph', 22, 70, {
                                id: 'pricing-faq-copy',
                                width: 214,
                                height: 70,
                                props: { content: 'Bind plan terms, billing intervals, refunds, and trial rules from Backy commerce settings or custom collections.', fontSize: 14, lineHeight: 1.45, color: '#4b5563' },
                                responsive: {
                                    tablet: { width: 520, height: 62 },
                                    mobile: { width: 270, height: 92 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'services') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'services-hero-section',
                width: 1200,
                height: 340,
                dataBindings: [{ source: 'services', mode: 'overview', fields: ['packages', 'formats', 'bookingUrl', 'availability'] }],
                props: { backgroundColor: '#fff1f2', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 450 },
                    mobile: { width: 375, height: 570 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'services-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Services', fontSize: 13, fontWeight: '800', color: '#be123c', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'services-heading',
                        width: 640,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 124, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 214, {
                        id: 'services-copy',
                        width: 580,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#4b5563' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 112, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 754, 96, {
                        id: 'services-format-filter',
                        width: 340,
                        height: 86,
                        dataBindings: [{ source: 'services', mode: 'format-filter', fields: ['all', 'online', 'inPerson'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#fecdd3', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 318, width: 340, height: 86 },
                            mobile: { x: 24, y: 376, width: 327, height: 146 },
                        },
                        children: [
                            createCanvasElement('button', 16, 20, {
                                id: 'services-filter-all',
                                width: 86,
                                height: 46,
                                props: { label: 'All', backgroundColor: '#be123c', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'services.filter.all' },
                            }),
                            createCanvasElement('button', 116, 20, {
                                id: 'services-filter-online',
                                width: 92,
                                height: 46,
                                props: { label: 'Online', backgroundColor: '#fff1f2', color: '#9f1239', borderRadius: 8, fontWeight: '800', action: 'services.filter.online' },
                            }),
                            createCanvasElement('button', 222, 20, {
                                id: 'services-filter-in-person',
                                width: 102,
                                height: 46,
                                props: { label: 'In person', backgroundColor: '#fff1f2', color: '#9f1239', borderRadius: 8, fontWeight: '800', action: 'services.filter.in_person' },
                                responsive: {
                                    mobile: { x: 16, y: 80, width: 130 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 340, {
                id: 'services-list-section',
                width: 1200,
                height: 470,
                dataBindings: [{ source: 'services', mode: 'list', limit: 6 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 450, width: 768, height: 1120 },
                    mobile: { y: 570, width: 375, height: 1110 },
                },
                children: [
                    createCanvasElement('heading', 74, 54, {
                        id: 'services-list-heading',
                        width: 400,
                        height: 42,
                        props: { content: 'Choose a service', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { name: 'Strategy session', duration: '60 minutes', price: '$120' },
                        { name: 'Implementation sprint', duration: '2 weeks', price: '$1,800' },
                        { name: 'Monthly care plan', duration: 'Ongoing', price: '$320/mo' },
                    ].map((service, index) => createCanvasElement('box', 74 + index * 350, 130, {
                        id: `services-card-${index}`,
                        width: 310,
                        height: 260,
                        dataBindings: [{ source: 'services', mode: 'service', index }],
                        props: { backgroundColor: index === 1 ? '#111827' : '#f9fafb', borderRadius: 8, borderColor: index === 1 ? '#111827' : '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 330, width: 660, height: 276 },
                            mobile: { x: 24, y: 118 + index * 322, width: 327, height: 276 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `services-card-title-${index}`,
                                width: 230,
                                height: 34,
                                props: { content: service.name, level: 'h3', fontSize: 22, fontWeight: '800', color: index === 1 ? '#ffffff' : '#111827' },
                                dataBindings: [{ source: 'services', mode: 'service', index, field: 'name', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 260 },
                                    mobile: { width: 238 },
                                },
                            }),
                            createCanvasElement('text', 24, 78, {
                                id: `services-card-duration-${index}`,
                                width: 150,
                                height: 24,
                                props: { content: service.duration, fontSize: 14, fontWeight: '800', color: index === 1 ? '#fecdd3' : '#be123c' },
                                dataBindings: [{ source: 'services', mode: 'service', index, field: 'duration', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('text', 24, 118, {
                                id: `services-card-price-${index}`,
                                width: 150,
                                height: 36,
                                props: { content: service.price, fontSize: 28, fontWeight: '800', color: index === 1 ? '#ffffff' : '#111827' },
                                dataBindings: [{ source: 'services', mode: 'service', index, field: 'price', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 166, {
                                id: `services-card-copy-${index}`,
                                width: 230,
                                height: 42,
                                props: { content: 'Bind service descriptions, availability, and delivery format from Backy collections or service settings.', fontSize: 13, lineHeight: 1.45, color: index === 1 ? '#d1d5db' : '#4b5563' },
                                responsive: {
                                    tablet: { width: 430 },
                                    mobile: { width: 268, height: 48 },
                                },
                            }),
                            createCanvasElement('button', 24, 218, {
                                id: `services-booking-button-${index}`,
                                width: 150,
                                height: 42,
                                props: { label: 'Book service', backgroundColor: index === 1 ? '#f43f5e' : '#111827', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'services.booking.request' },
                                responsive: {
                                    tablet: { x: 460, y: 210, width: 154 },
                                    mobile: { x: 24, y: 216, width: 150 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 810, {
                id: 'services-process-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'services', mode: 'process', fields: ['steps', 'faq', 'contactUrl'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1570, width: 768, height: 620 },
                    mobile: { y: 1680, width: 375, height: 640 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'services-process-heading',
                        width: 460,
                        height: 42,
                        props: { content: 'How booking works', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 430 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...['Pick a package', 'Share context', 'Confirm the slot'].map((step, index) => createCanvasElement('box', 74 + index * 270, 132, {
                        id: `services-process-step-${index}`,
                        width: 230,
                        height: 118,
                        dataBindings: [{ source: 'services', mode: 'process-step', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54 + (index % 2) * 330, y: 130 + Math.floor(index / 2) * 150, width: 300, height: 118 },
                            mobile: { x: 24, y: 118 + index * 132, width: 327, height: 110 },
                        },
                        children: [
                            createCanvasElement('text', 22, 18, {
                                id: `services-process-number-${index}`,
                                width: 40,
                                height: 24,
                                props: { content: `0${index + 1}`, fontSize: 14, fontWeight: '800', color: '#be123c' },
                            }),
                            createCanvasElement('heading', 22, 52, {
                                id: `services-process-title-${index}`,
                                width: 170,
                                height: 28,
                                props: { content: step, level: 'h3', fontSize: 19, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'services', mode: 'process-step', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 210 },
                                    mobile: { width: 240 },
                                },
                            }),
                        ],
                    })),
                    createCanvasElement('box', 908, 132, {
                        id: 'services-inquiry-card',
                        width: 220,
                        height: 118,
                        props: { backgroundColor: '#111827', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 430, width: 660, height: 130 },
                            mobile: { x: 24, y: 520, width: 327, height: 120 },
                        },
                        children: [
                            createCanvasElement('paragraph', 22, 20, {
                                id: 'services-inquiry-copy',
                                width: 160,
                                height: 38,
                                props: { content: 'Need a custom scope?', fontSize: 15, fontWeight: '800', lineHeight: 1.35, color: '#ffffff' },
                                responsive: {
                                    tablet: { width: 240 },
                                    mobile: { width: 210 },
                                },
                            }),
                            createCanvasElement('button', 22, 70, {
                                id: 'services-inquiry-button',
                                width: 132,
                                height: 36,
                                props: { label: 'Send inquiry', backgroundColor: '#f43f5e', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'services.inquiry.open' },
                                responsive: {
                                    tablet: { x: 460, y: 48, width: 148 },
                                    mobile: { x: 22, y: 68, width: 140 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'booking') {
        const appointmentTypes = [
            { name: 'Intro call', duration: '30 minutes', price: 'Free', summary: 'A quick fit check before a project, service package, or support plan.' },
            { name: 'Strategy session', duration: '60 minutes', price: '$120', summary: 'A focused planning session with notes, next steps, and handoff actions.' },
            { name: 'Implementation review', duration: '90 minutes', price: '$220', summary: 'Review a launch, content model, storefront, or editor workflow before release.' },
        ];

        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'booking-hero-section',
                width: 1200,
                height: 360,
                dataBindings: [{ source: 'booking', mode: 'overview', fields: ['appointmentTypes', 'staff', 'locations', 'availability', 'bookingUrl'] }],
                props: { backgroundColor: '#f0fdfa', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 500 },
                    mobile: { width: 375, height: 620 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'booking-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Booking', fontSize: 13, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 98, {
                        id: 'booking-heading',
                        width: 650,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 124, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 212, {
                        id: 'booking-intro-copy',
                        width: 620,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#374151' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 112, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 92, {
                        id: 'booking-availability-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'booking', mode: 'availability-summary', fields: ['nextAvailable', 'timezone', 'locations'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#99f6e4', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 318, width: 330, height: 150 },
                            mobile: { x: 24, y: 382, width: 327, height: 166 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'booking-availability-label',
                                width: 170,
                                height: 24,
                                props: { content: 'Next available', fontSize: 13, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 58, {
                                id: 'booking-availability-value',
                                width: 230,
                                height: 36,
                                props: { content: 'This week', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'booking', mode: 'availability-summary', field: 'nextAvailable', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { width: 250 },
                                },
                            }),
                            createCanvasElement('text', 24, 108, {
                                id: 'booking-timezone-note',
                                width: 220,
                                height: 24,
                                props: { content: 'Local timezone shown at checkout', fontSize: 13, color: '#475569' },
                                dataBindings: [{ source: 'booking', mode: 'availability-summary', field: 'timezone', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 360, {
                id: 'booking-appointment-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'booking', mode: 'appointment-types', fields: ['appointmentTypes', 'staff', 'prices', 'durations'], limit: 6 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 500, width: 768, height: 1120 },
                    mobile: { y: 620, width: 375, height: 1120 },
                },
                children: [
                    createCanvasElement('heading', 74, 58, {
                        id: 'booking-appointment-heading',
                        width: 420,
                        height: 42,
                        props: { content: 'Choose a session', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('box', 760, 54, {
                        id: 'booking-location-filter',
                        width: 320,
                        height: 56,
                        dataBindings: [{ source: 'booking', mode: 'filters', fields: ['staff', 'locations', 'formats'] }],
                        props: { backgroundColor: '#f0fdfa', borderRadius: 8, borderColor: '#99f6e4', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 112, width: 320 },
                            mobile: { x: 24, y: 100, width: 327 },
                        },
                        children: [
                            createCanvasElement('text', 20, 17, {
                                id: 'booking-location-filter-label',
                                width: 250,
                                height: 24,
                                props: { content: 'Filter by staff, format, or location', fontSize: 13, fontWeight: '800', color: '#0f766e' },
                                responsive: {
                                    mobile: { width: 270 },
                                },
                            }),
                        ],
                    }),
                    ...appointmentTypes.map((item, index) => createCanvasElement('box', 74 + index * 350, 146, {
                        id: `booking-appointment-card-${index}`,
                        width: 300,
                        height: 300,
                        dataBindings: [{ source: 'booking', mode: 'appointment-type', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#99f6e4', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 204 + index * 304, width: 660, height: 276 },
                            mobile: { x: 24, y: 182 + index * 300, width: 327, height: 276 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 26, {
                                id: `booking-appointment-title-${index}`,
                                width: 230,
                                height: 34,
                                props: { content: item.name, level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'booking', mode: 'appointment-type', index, field: 'name', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 300 },
                                    mobile: { width: 238 },
                                },
                            }),
                            createCanvasElement('text', 24, 78, {
                                id: `booking-appointment-duration-${index}`,
                                width: 150,
                                height: 24,
                                props: { content: item.duration, fontSize: 14, fontWeight: '800', color: '#0f766e' },
                                dataBindings: [{ source: 'booking', mode: 'appointment-type', index, field: 'duration', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('text', 190, 78, {
                                id: `booking-appointment-price-${index}`,
                                width: 80,
                                height: 24,
                                props: { content: item.price, fontSize: 14, fontWeight: '800', color: '#111827', textAlign: 'right' },
                                dataBindings: [{ source: 'booking', mode: 'appointment-type', index, field: 'price', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { x: 520, width: 90 },
                                    mobile: { x: 198, width: 80 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 126, {
                                id: `booking-appointment-summary-${index}`,
                                width: 230,
                                height: 70,
                                props: { content: item.summary, fontSize: 14, lineHeight: 1.45, color: '#475569' },
                                dataBindings: [{ source: 'booking', mode: 'appointment-type', index, field: 'summary', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 430, height: 62 },
                                    mobile: { width: 268, height: 70 },
                                },
                            }),
                            createCanvasElement('button', 24, 234, {
                                id: `booking-appointment-button-${index}`,
                                width: 134,
                                height: 42,
                                props: { label: 'Select time', backgroundColor: '#0f766e', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'booking.appointment.select' },
                                dataBindings: [{ source: 'booking', mode: 'appointment-type', index, field: 'bookingUrl', targetPath: 'props.href' }],
                                responsive: {
                                    tablet: { x: 480, y: 210, width: 134 },
                                    mobile: { x: 24, y: 214, width: 134 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 920, {
                id: 'booking-intake-section',
                width: 1200,
                height: 360,
                dataBindings: [{ source: 'booking', mode: 'intake', fields: ['intakeQuestions', 'calendarProvider', 'confirmationEmail', 'bookingUrl'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1620, width: 768, height: 720 },
                    mobile: { y: 1740, width: 375, height: 820 },
                },
                children: [
                    createCanvasElement('form', 74, 58, {
                        id: 'booking-intake-form',
                        width: 470,
                        height: 240,
                        dataBindings: [{ source: 'booking', mode: 'intake-form', fields: ['name', 'email', 'topic', 'notes'] }],
                        props: {
                            formId: `form-${formSlug}-booking-intake`,
                            formName: `${formSlug}-booking-intake`,
                            formTitle: 'Booking intake',
                            formDescription: 'Collect scheduling context before handing visitors to the configured booking provider.',
                            formActive: true,
                            formAudience: 'public',
                        },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 286 },
                            mobile: { x: 24, y: 46, width: 327, height: 392 },
                        },
                        children: [
                            createCanvasElement('input', 24, 26, {
                                id: 'booking-intake-name',
                                width: 198,
                                height: 52,
                                props: { label: 'Name', name: 'name', placeholder: 'Your name', required: true },
                                responsive: {
                                    tablet: { width: 292 },
                                    mobile: { x: 20, y: 24, width: 287 },
                                },
                            }),
                            createCanvasElement('input', 244, 26, {
                                id: 'booking-intake-email',
                                width: 198,
                                height: 52,
                                props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true },
                                responsive: {
                                    tablet: { x: 340, width: 292 },
                                    mobile: { x: 20, y: 94, width: 287 },
                                },
                            }),
                            createCanvasElement('select', 24, 102, {
                                id: 'booking-intake-topic',
                                width: 418,
                                height: 52,
                                props: { label: 'Topic', name: 'topic', options: ['Strategy', 'Implementation', 'Support'], placeholder: 'Choose a topic', required: true },
                                responsive: {
                                    tablet: { width: 608 },
                                    mobile: { x: 20, y: 164, width: 287 },
                                },
                            }),
                            createCanvasElement('textarea', 24, 176, {
                                id: 'booking-intake-notes',
                                width: 418,
                                height: 58,
                                props: { label: 'Notes', name: 'notes', placeholder: 'Share context before the session', required: false },
                                responsive: {
                                    tablet: { width: 608, height: 66 },
                                    mobile: { x: 20, y: 234, width: 287, height: 112 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 650, 58, {
                        id: 'booking-confirmation-card',
                        width: 390,
                        height: 240,
                        dataBindings: [{ source: 'booking', mode: 'confirmation', fields: ['bookingUrl', 'calendarProvider', 'confirmationEmail'] }],
                        props: { backgroundColor: '#134e4a', borderRadius: 8, borderColor: '#134e4a', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 390, width: 660, height: 210 },
                            mobile: { x: 24, y: 490, width: 327, height: 238 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 28, {
                                id: 'booking-confirmation-heading',
                                width: 260,
                                height: 34,
                                props: { content: 'Confirm the slot', level: 'h2', fontSize: 26, fontWeight: '800', color: '#ffffff' },
                                responsive: {
                                    tablet: { width: 300 },
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 28, 82, {
                                id: 'booking-confirmation-copy',
                                width: 300,
                                height: 64,
                                props: { content: 'Hand off to Calendly, Cal.com, Google Calendar, or a custom scheduling API without collecting payment secrets on this page.', fontSize: 14, lineHeight: 1.5, color: '#ccfbf1' },
                                responsive: {
                                    tablet: { width: 420, height: 58 },
                                    mobile: { width: 258, height: 92 },
                                },
                            }),
                            createCanvasElement('button', 28, 166, {
                                id: 'booking-confirmation-button',
                                width: 156,
                                height: 44,
                                props: { label: 'Continue booking', backgroundColor: '#ffffff', color: '#134e4a', borderRadius: 8, fontSize: 14, fontWeight: '800', action: 'booking.provider.open' },
                                dataBindings: [{ source: 'booking', mode: 'confirmation', field: 'bookingUrl', targetPath: 'props.href' }],
                                responsive: {
                                    tablet: { x: 468, y: 118 },
                                    mobile: { x: 28, y: 166 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'portfolio') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'portfolio-hero-section',
                width: 1200,
                height: 350,
                dataBindings: [{ source: 'portfolio', mode: 'overview', fields: ['projects', 'categories', 'featuredProject', 'mediaAssets'] }],
                props: { backgroundColor: '#ecfeff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 500 },
                    mobile: { width: 375, height: 650 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'portfolio-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Portfolio', fontSize: 13, fontWeight: '800', color: '#0e7490', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'portfolio-heading',
                        width: 640,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 124, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 214, {
                        id: 'portfolio-copy',
                        width: 580,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#334155' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 112, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 760, 82, {
                        id: 'portfolio-featured-card',
                        width: 330,
                        height: 200,
                        dataBindings: [{ source: 'portfolio', mode: 'featured-project', fields: ['title', 'summary', 'coverImage', 'outcome'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#a5f3fc', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 318, width: 360, height: 156 },
                            mobile: { x: 24, y: 390, width: 327, height: 190 },
                        },
                        children: [
                            createCanvasElement('text', 24, 22, {
                                id: 'portfolio-featured-label',
                                width: 150,
                                height: 22,
                                props: { content: 'Featured case', fontSize: 12, fontWeight: '800', color: '#0e7490', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 58, {
                                id: 'portfolio-featured-title',
                                width: 230,
                                height: 52,
                                props: { content: 'Selected project title', level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'portfolio', mode: 'featured-project', field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 280, height: 34 },
                                    mobile: { width: 250, height: 52 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 120, {
                                id: 'portfolio-featured-copy',
                                width: 240,
                                height: 44,
                                props: { content: 'Bind outcomes, project notes, and cover media from Backy project records.', fontSize: 13, lineHeight: 1.45, color: '#4b5563' },
                                dataBindings: [{ source: 'portfolio', mode: 'featured-project', field: 'summary', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { y: 108, width: 280, height: 38 },
                                    mobile: { width: 260, height: 50 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 350, {
                id: 'portfolio-gallery-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'portfolio', mode: 'project-list', limit: 6 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 500, width: 768, height: 1180 },
                    mobile: { y: 650, width: 375, height: 1260 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'portfolio-gallery-heading',
                        width: 420,
                        height: 42,
                        props: { content: 'Selected work', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('box', 720, 48, {
                        id: 'portfolio-category-filter',
                        width: 340,
                        height: 58,
                        dataBindings: [{ source: 'portfolio', mode: 'category-filter', fields: ['all', 'web', 'brand', 'commerce'] }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 112, width: 340 },
                            mobile: { x: 24, y: 100, width: 327, height: 108 },
                        },
                        children: [
                            createCanvasElement('button', 12, 10, {
                                id: 'portfolio-filter-all',
                                width: 70,
                                height: 38,
                                props: { label: 'All', backgroundColor: '#0e7490', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'portfolio.filter.all' },
                            }),
                            createCanvasElement('button', 94, 10, {
                                id: 'portfolio-filter-web',
                                width: 76,
                                height: 38,
                                props: { label: 'Web', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'portfolio.filter.web' },
                            }),
                            createCanvasElement('button', 182, 10, {
                                id: 'portfolio-filter-brand',
                                width: 84,
                                height: 38,
                                props: { label: 'Brand', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'portfolio.filter.brand' },
                                responsive: {
                                    mobile: { x: 12, y: 58, width: 84 },
                                },
                            }),
                        ],
                    }),
                    ...[
                        { title: 'Launch system', type: 'Web design' },
                        { title: 'Member portal', type: 'CMS build' },
                        { title: 'Commerce kit', type: 'Storefront' },
                    ].map((project, index) => createCanvasElement('box', 74 + index * 350, 140, {
                        id: `portfolio-project-card-${index}`,
                        width: 310,
                        height: 330,
                        dataBindings: [{ source: 'portfolio', mode: 'project', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54 + (index % 2) * 340, y: 204 + Math.floor(index / 2) * 388, width: 300, height: 336 },
                            mobile: { x: 24, y: 242 + index * 338, width: 327, height: 312 },
                        },
                        children: [
                            createCanvasElement('box', 18, 18, {
                                id: `portfolio-project-media-${index}`,
                                width: 274,
                                height: 146,
                                dataBindings: [{ source: 'portfolio', mode: 'project', index, field: 'coverImage', targetPath: 'props.media' }],
                                props: { backgroundColor: index === 1 ? '#cffafe' : '#e0f2fe', borderRadius: 8, borderColor: '#bae6fd', borderWidth: 1, borderStyle: 'solid' },
                                responsive: {
                                    tablet: { width: 264, height: 146 },
                                    mobile: { width: 291, height: 132 },
                                },
                                children: [
                                    createCanvasElement('text', 82, 60, {
                                        id: `portfolio-project-media-label-${index}`,
                                        width: 110,
                                        height: 24,
                                        props: { content: 'Project media', fontSize: 13, fontWeight: '800', color: '#0e7490', textAlign: 'center' },
                                        responsive: {
                                            tablet: { x: 77 },
                                            mobile: { x: 90, y: 54 },
                                        },
                                    }),
                                ],
                            }),
                            createCanvasElement('text', 22, 184, {
                                id: `portfolio-project-type-${index}`,
                                width: 150,
                                height: 22,
                                props: { content: project.type, fontSize: 12, fontWeight: '800', color: '#0e7490', textTransform: 'uppercase' },
                                dataBindings: [{ source: 'portfolio', mode: 'project', index, field: 'category', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('heading', 22, 218, {
                                id: `portfolio-project-title-${index}`,
                                width: 220,
                                height: 32,
                                props: { content: project.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'portfolio', mode: 'project', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { y: 208, width: 240 },
                                },
                            }),
                            createCanvasElement('button', 22, 276, {
                                id: `portfolio-project-button-${index}`,
                                width: 132,
                                height: 40,
                                props: { label: 'View case', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'portfolio.case.open' },
                                responsive: {
                                    mobile: { y: 258 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 910, {
                id: 'portfolio-inquiry-section',
                width: 1200,
                height: 270,
                dataBindings: [{ source: 'portfolio', mode: 'inquiry', fields: ['contactUrl', 'services', 'availability'] }],
                props: { backgroundColor: '#0f172a', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1680, width: 768, height: 360 },
                    mobile: { y: 1910, width: 375, height: 390 },
                },
                children: [
                    createCanvasElement('heading', 74, 66, {
                        id: 'portfolio-inquiry-heading',
                        width: 520,
                        height: 44,
                        props: { content: 'Start a similar project', level: 'h2', fontSize: 36, fontWeight: '800', color: '#ffffff' },
                        responsive: {
                            tablet: { x: 54, y: 58, width: 500 },
                            mobile: { x: 24, y: 46, width: 327, height: 84, props: { fontSize: 30 } },
                        },
                    }),
                    createCanvasElement('paragraph', 78, 132, {
                        id: 'portfolio-inquiry-copy',
                        width: 540,
                        height: 58,
                        props: { content: 'Connect this CTA to Backy Forms, services, or a custom frontend route so visitors can request project scope and share media references.', fontSize: 16, lineHeight: 1.55, color: '#cbd5e1' },
                        responsive: {
                            tablet: { x: 56, y: 130, width: 520, height: 70 },
                            mobile: { x: 26, y: 150, width: 323, height: 100 },
                        },
                    }),
                    createCanvasElement('button', 830, 104, {
                        id: 'portfolio-inquiry-button',
                        width: 178,
                        height: 52,
                        props: { label: 'Request project', backgroundColor: '#06b6d4', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'portfolio.inquiry.open' },
                        responsive: {
                            tablet: { x: 54, y: 236, width: 178 },
                            mobile: { x: 24, y: 282, width: 178 },
                        },
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'gallery') {
        const galleryAssets = [
            { title: 'Launch visuals', type: 'Image', folder: 'Campaigns', color: '#dbeafe' },
            { title: 'Studio reel', type: 'Video', folder: 'Video', color: '#e0e7ff' },
            { title: 'Brand kit', type: 'File', folder: 'Documents', color: '#fef3c7' },
            { title: 'Typeface set', type: 'Font', folder: 'Fonts', color: '#dcfce7' },
            { title: 'Product detail', type: 'Image', folder: 'Products', color: '#fae8ff' },
            { title: 'Press pack', type: 'File', folder: 'Downloads', color: '#f1f5f9' },
        ];

        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'gallery-hero-section',
                width: 1200,
                height: 360,
                dataBindings: [{ source: 'media', mode: 'gallery-overview', fields: ['folders', 'assetTypes', 'tags', 'featuredAsset', 'downloadUrl'] }],
                props: { backgroundColor: '#eff6ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 520 },
                    mobile: { width: 375, height: 650 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'gallery-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Media gallery', fontSize: 13, fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'gallery-heading',
                        width: 620,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 124, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 214, {
                        id: 'gallery-copy',
                        width: 590,
                        height: 74,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#334155' },
                        responsive: {
                            tablet: { x: 56, y: 206, width: 500, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 112, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 760, 76, {
                        id: 'gallery-featured-asset',
                        width: 330,
                        height: 220,
                        dataBindings: [{ source: 'media', mode: 'featured-asset', fields: ['title', 'thumbnailUrl', 'assetType', 'folder', 'altText'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bfdbfe', borderWidth: 1, borderStyle: 'solid', boxShadow: '0 18px 45px rgba(37, 99, 235, 0.12)' },
                        responsive: {
                            tablet: { x: 54, y: 330, width: 360, height: 160 },
                            mobile: { x: 24, y: 390, width: 327, height: 220 },
                        },
                        children: [
                            createCanvasElement('box', 24, 24, {
                                id: 'gallery-featured-thumbnail',
                                width: 282,
                                height: 118,
                                dataBindings: [{ source: 'media', mode: 'featured-asset', field: 'thumbnailUrl', targetPath: 'props.media' }],
                                props: { backgroundColor: '#dbeafe', borderRadius: 8, borderColor: '#bfdbfe', borderWidth: 1, borderStyle: 'solid' },
                                responsive: {
                                    tablet: { width: 150, height: 112 },
                                    mobile: { width: 279, height: 118 },
                                },
                            }),
                            createCanvasElement('text', 24, 158, {
                                id: 'gallery-featured-type',
                                width: 110,
                                height: 22,
                                dataBindings: [{ source: 'media', mode: 'featured-asset', field: 'assetType', targetPath: 'props.content' }],
                                props: { content: 'Featured', fontSize: 12, fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase' },
                                responsive: {
                                    tablet: { x: 198, y: 30 },
                                },
                            }),
                            createCanvasElement('heading', 24, 184, {
                                id: 'gallery-featured-title',
                                width: 230,
                                height: 28,
                                dataBindings: [{ source: 'media', mode: 'featured-asset', field: 'title', targetPath: 'props.content' }],
                                props: { content: 'Selected media asset', level: 'h3', fontSize: 20, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    tablet: { x: 198, y: 62, width: 130, height: 54 },
                                    mobile: { width: 240 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 360, {
                id: 'gallery-filter-section',
                width: 1200,
                height: 160,
                dataBindings: [{ source: 'media', mode: 'filters', fields: ['folders', 'assetTypes', 'tags'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 520, width: 768, height: 190 },
                    mobile: { y: 650, width: 375, height: 250 },
                },
                children: [
                    createCanvasElement('heading', 74, 50, {
                        id: 'gallery-filter-heading',
                        width: 260,
                        height: 38,
                        props: { content: 'Browse library', level: 'h2', fontSize: 30, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 42, width: 260 },
                            mobile: { x: 24, y: 36, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('box', 426, 42, {
                        id: 'gallery-folder-filter',
                        width: 520,
                        height: 70,
                        dataBindings: [{ source: 'media', mode: 'folder-filter', fields: ['all', 'campaigns', 'products', 'downloads', 'fonts'] }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 104, width: 520, height: 70 },
                            mobile: { x: 24, y: 94, width: 327, height: 118 },
                        },
                        children: [
                            createCanvasElement('button', 14, 14, { id: 'gallery-filter-all', width: 70, height: 42, props: { label: 'All', backgroundColor: '#1d4ed8', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'media.gallery.filter.all' } }),
                            createCanvasElement('button', 96, 14, { id: 'gallery-filter-images', width: 92, height: 42, props: { label: 'Images', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'media.gallery.filter.images' } }),
                            createCanvasElement('button', 200, 14, { id: 'gallery-filter-videos', width: 88, height: 42, props: { label: 'Videos', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'media.gallery.filter.videos' } }),
                            createCanvasElement('button', 300, 14, { id: 'gallery-filter-files', width: 74, height: 42, props: { label: 'Files', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'media.gallery.filter.files' }, responsive: { mobile: { x: 14, y: 62 } } }),
                            createCanvasElement('button', 386, 14, { id: 'gallery-filter-fonts', width: 78, height: 42, props: { label: 'Fonts', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'media.gallery.filter.fonts' }, responsive: { mobile: { x: 100, y: 62 } } }),
                        ],
                    }),
                    createCanvasElement('button', 980, 52, {
                        id: 'gallery-upload-handoff-button',
                        width: 138,
                        height: 46,
                        props: { label: 'Open media', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'media.library.open' },
                        responsive: {
                            tablet: { x: 594, y: 116, width: 120 },
                            mobile: { x: 24, y: 220, width: 138 },
                        },
                    }),
                ],
            }),
            createCanvasElement('section', 0, 520, {
                id: 'gallery-grid-section',
                width: 1200,
                height: 620,
                dataBindings: [{ source: 'media', mode: 'asset-list', limit: 12, fields: ['title', 'thumbnailUrl', 'assetType', 'folder', 'tags', 'downloadUrl'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 710, width: 768, height: 980 },
                    mobile: { y: 900, width: 375, height: 1540 },
                },
                children: [
                    ...galleryAssets.map((asset, index) => createCanvasElement('box', 74 + (index % 3) * 350, 54 + Math.floor(index / 3) * 258, {
                        id: `gallery-media-card-${index}`,
                        width: 310,
                        height: 220,
                        dataBindings: [{ source: 'media', mode: 'asset', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#dbe3ea', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54 + (index % 2) * 340, y: 48 + Math.floor(index / 2) * 300, width: 300, height: 240 },
                            mobile: { x: 24, y: 44 + index * 246, width: 327, height: 226 },
                        },
                        children: [
                            createCanvasElement('box', 18, 18, {
                                id: `gallery-media-thumbnail-${index}`,
                                width: 274,
                                height: 112,
                                dataBindings: [{ source: 'media', mode: 'asset', index, field: 'thumbnailUrl', targetPath: 'props.media' }],
                                props: { backgroundColor: asset.color, borderRadius: 8, borderColor: '#bfdbfe', borderWidth: 1, borderStyle: 'solid' },
                                responsive: {
                                    tablet: { width: 264, height: 118 },
                                    mobile: { width: 291, height: 104 },
                                },
                            }),
                            createCanvasElement('text', 22, 146, {
                                id: `gallery-media-type-${index}`,
                                width: 106,
                                height: 22,
                                dataBindings: [{ source: 'media', mode: 'asset', index, field: 'assetType', targetPath: 'props.content' }],
                                props: { content: asset.type, fontSize: 12, fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase' },
                                responsive: {
                                    mobile: { y: 136 },
                                },
                            }),
                            createCanvasElement('heading', 22, 170, {
                                id: `gallery-media-title-${index}`,
                                width: 186,
                                height: 28,
                                dataBindings: [{ source: 'media', mode: 'asset', index, field: 'title', targetPath: 'props.content' }],
                                props: { content: asset.title, level: 'h3', fontSize: 19, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { y: 160, width: 190 },
                                },
                            }),
                            createCanvasElement('button', 210, 158, {
                                id: `gallery-media-open-button-${index}`,
                                width: 74,
                                height: 38,
                                dataBindings: [{ source: 'media', mode: 'asset', index, field: 'downloadUrl', targetPath: 'props.href' }],
                                props: { label: 'Open', backgroundColor: '#dbeafe', color: '#1e3a8a', borderRadius: 8, fontWeight: '800', action: 'media.asset.open' },
                                responsive: {
                                    tablet: { x: 202 },
                                    mobile: { x: 224, y: 148 },
                                },
                            }),
                            createCanvasElement('text', 22, 198, {
                                id: `gallery-media-folder-${index}`,
                                width: 180,
                                height: 20,
                                dataBindings: [{ source: 'media', mode: 'asset', index, field: 'folder', targetPath: 'props.content' }],
                                props: { content: asset.folder, fontSize: 12, fontWeight: '700', color: '#64748b' },
                                responsive: {
                                    mobile: { y: 190 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 1140, {
                id: 'gallery-lightbox-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'media', mode: 'lightbox', fields: ['selectedAsset', 'caption', 'altText', 'downloadUrl', 'license'] }],
                props: { backgroundColor: '#0f172a', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1690, width: 768, height: 360 },
                    mobile: { y: 2440, width: 375, height: 420 },
                },
                children: [
                    createCanvasElement('heading', 74, 70, {
                        id: 'gallery-lightbox-heading',
                        width: 520,
                        height: 44,
                        props: { content: 'Lightbox and downloads', level: 'h2', fontSize: 36, fontWeight: '800', color: '#ffffff' },
                        responsive: {
                            tablet: { x: 54, y: 58, width: 500 },
                            mobile: { x: 24, y: 46, width: 327, height: 84, props: { fontSize: 30 } },
                        },
                    }),
                    createCanvasElement('paragraph', 78, 134, {
                        id: 'gallery-lightbox-copy',
                        width: 570,
                        height: 66,
                        props: { content: 'Bind the selected asset, caption, alt text, license notes, and download URL from the central Backy media library so custom frontends can render a public gallery without scraping admin screens.', fontSize: 16, lineHeight: 1.55, color: '#cbd5e1' },
                        responsive: {
                            tablet: { x: 56, y: 130, width: 540, height: 74 },
                            mobile: { x: 26, y: 150, width: 323, height: 126 },
                        },
                    }),
                    createCanvasElement('button', 820, 112, {
                        id: 'gallery-lightbox-button',
                        width: 168,
                        height: 52,
                        dataBindings: [{ source: 'media', mode: 'lightbox', field: 'downloadUrl', targetPath: 'props.href' }],
                        props: { label: 'Open asset', backgroundColor: '#60a5fa', color: '#0f172a', borderRadius: 8, fontWeight: '800', action: 'media.lightbox.open' },
                        responsive: {
                            tablet: { x: 54, y: 240 },
                            mobile: { x: 24, y: 314 },
                        },
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'events') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'events-hero-section',
                width: 1200,
                height: 350,
                dataBindings: [{ source: 'events', mode: 'overview', fields: ['events', 'formats', 'locations', 'registrationUrl'] }],
                props: { backgroundColor: '#f7fee7', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 450 },
                    mobile: { width: 375, height: 570 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'events-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Events', fontSize: 13, fontWeight: '800', color: '#4d7c0f', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'events-heading',
                        width: 640,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 124, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 214, {
                        id: 'events-copy',
                        width: 580,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#334155' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 112, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 760, 98, {
                        id: 'events-format-filter',
                        width: 340,
                        height: 86,
                        dataBindings: [{ source: 'events', mode: 'format-filter', fields: ['all', 'online', 'inPerson'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#d9f99d', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 318, width: 340, height: 86 },
                            mobile: { x: 24, y: 376, width: 327, height: 146 },
                        },
                        children: [
                            createCanvasElement('button', 16, 20, {
                                id: 'events-filter-all',
                                width: 86,
                                height: 46,
                                props: { label: 'All', backgroundColor: '#4d7c0f', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'events.filter.all' },
                            }),
                            createCanvasElement('button', 116, 20, {
                                id: 'events-filter-online',
                                width: 92,
                                height: 46,
                                props: { label: 'Online', backgroundColor: '#f7fee7', color: '#3f6212', borderRadius: 8, fontWeight: '800', action: 'events.filter.online' },
                            }),
                            createCanvasElement('button', 222, 20, {
                                id: 'events-filter-in-person',
                                width: 102,
                                height: 46,
                                props: { label: 'In person', backgroundColor: '#f7fee7', color: '#3f6212', borderRadius: 8, fontWeight: '800', action: 'events.filter.in_person' },
                                responsive: {
                                    mobile: { x: 16, y: 80, width: 130 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 350, {
                id: 'events-list-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'events', mode: 'list', limit: 6, sort: 'startsAt:asc' }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 450, width: 768, height: 1120 },
                    mobile: { y: 570, width: 375, height: 1140 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'events-list-heading',
                        width: 440,
                        height: 42,
                        props: { content: 'Upcoming events', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Product workshop', date: 'Jun 18', location: 'Online', capacity: '24 seats' },
                        { title: 'Creator meetup', date: 'Jul 02', location: 'New York', capacity: '40 seats' },
                        { title: 'Launch clinic', date: 'Jul 16', location: 'Online', capacity: '18 seats' },
                    ].map((event, index) => createCanvasElement('box', 74 + index * 350, 132, {
                        id: `events-card-${index}`,
                        width: 310,
                        height: 330,
                        dataBindings: [{ source: 'events', mode: 'event', index }],
                        props: { backgroundColor: index === 1 ? '#111827' : '#f9fafb', borderRadius: 8, borderColor: index === 1 ? '#111827' : '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 332, width: 660, height: 286 },
                            mobile: { x: 24, y: 118 + index * 328, width: 327, height: 294 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: `events-card-date-${index}`,
                                width: 90,
                                height: 28,
                                props: { content: event.date, fontSize: 18, fontWeight: '800', color: index === 1 ? '#bef264' : '#4d7c0f' },
                                dataBindings: [{ source: 'events', mode: 'event', index, field: 'startsAt', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('heading', 24, 72, {
                                id: `events-card-title-${index}`,
                                width: 230,
                                height: 60,
                                props: { content: event.title, level: 'h3', fontSize: 24, fontWeight: '800', color: index === 1 ? '#ffffff' : '#111827' },
                                dataBindings: [{ source: 'events', mode: 'event', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 300, height: 34 },
                                    mobile: { width: 240 },
                                },
                            }),
                            createCanvasElement('text', 24, 152, {
                                id: `events-card-location-${index}`,
                                width: 190,
                                height: 24,
                                props: { content: event.location, fontSize: 14, fontWeight: '800', color: index === 1 ? '#d1d5db' : '#334155' },
                                dataBindings: [{ source: 'events', mode: 'event', index, field: 'location', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('text', 24, 190, {
                                id: `events-card-capacity-${index}`,
                                width: 150,
                                height: 24,
                                props: { content: event.capacity, fontSize: 14, color: index === 1 ? '#d1d5db' : '#4b5563' },
                                dataBindings: [{ source: 'events', mode: 'event', index, field: 'capacity', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('button', 24, 256, {
                                id: `events-rsvp-button-${index}`,
                                width: 132,
                                height: 42,
                                props: { label: 'RSVP', backgroundColor: index === 1 ? '#84cc16' : '#111827', color: index === 1 ? '#111827' : '#ffffff', borderRadius: 8, fontWeight: '800', action: 'events.registration.open' },
                                responsive: {
                                    tablet: { x: 480, y: 220 },
                                    mobile: { x: 24, y: 232 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 910, {
                id: 'events-agenda-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'events', mode: 'agenda', fields: ['steps', 'speakers', 'faq'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1570, width: 768, height: 620 },
                    mobile: { y: 1710, width: 375, height: 640 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'events-agenda-heading',
                        width: 420,
                        height: 42,
                        props: { content: 'What to expect', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...['Welcome and setup', 'Live walkthrough', 'Q&A and next steps'].map((step, index) => createCanvasElement('box', 74 + index * 270, 130, {
                        id: `events-agenda-step-${index}`,
                        width: 230,
                        height: 104,
                        dataBindings: [{ source: 'events', mode: 'agenda-step', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54 + (index % 2) * 330, y: 130 + Math.floor(index / 2) * 142, width: 300, height: 110 },
                            mobile: { x: 24, y: 118 + index * 128, width: 327, height: 106 },
                        },
                        children: [
                            createCanvasElement('text', 22, 18, {
                                id: `events-agenda-time-${index}`,
                                width: 80,
                                height: 24,
                                props: { content: `${index + 1}:00`, fontSize: 14, fontWeight: '800', color: '#4d7c0f' },
                                dataBindings: [{ source: 'events', mode: 'agenda-step', index, field: 'time', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('heading', 22, 52, {
                                id: `events-agenda-title-${index}`,
                                width: 170,
                                height: 28,
                                props: { content: step, level: 'h3', fontSize: 18, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'events', mode: 'agenda-step', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 220 },
                                    mobile: { width: 240 },
                                },
                            }),
                        ],
                    })),
                    createCanvasElement('box', 906, 130, {
                        id: 'events-rsvp-card',
                        width: 220,
                        height: 104,
                        props: { backgroundColor: '#111827', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 420, width: 660, height: 130 },
                            mobile: { x: 24, y: 510, width: 327, height: 120 },
                        },
                        children: [
                            createCanvasElement('paragraph', 22, 18, {
                                id: 'events-rsvp-copy',
                                width: 160,
                                height: 36,
                                props: { content: 'Ready to join?', fontSize: 15, fontWeight: '800', lineHeight: 1.35, color: '#ffffff' },
                                responsive: {
                                    tablet: { width: 220 },
                                    mobile: { width: 210 },
                                },
                            }),
                            createCanvasElement('button', 22, 64, {
                                id: 'events-main-rsvp-button',
                                width: 120,
                                height: 34,
                                props: { label: 'Reserve spot', backgroundColor: '#84cc16', color: '#111827', borderRadius: 8, fontWeight: '800', action: 'events.registration.open' },
                                responsive: {
                                    tablet: { x: 470, y: 48, width: 128 },
                                    mobile: { x: 22, y: 68, width: 128 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'privacy') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'privacy-hero-section',
                width: 1200,
                height: 320,
                dataBindings: [{ source: 'settings', mode: 'legal-policy', fields: ['privacyPolicy', 'effectiveDate', 'contactEmail', 'processors'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 580 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'privacy-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Privacy', fontSize: 13, fontWeight: '800', color: '#475569', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'privacy-heading',
                        width: 640,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 124, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'privacy-copy',
                        width: 600,
                        height: 64,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#334155' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 86, {
                        id: 'privacy-effective-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'settings', mode: 'legal-policy', fields: ['effectiveDate', 'version', 'jurisdiction'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 330, height: 130 },
                            mobile: { x: 24, y: 378, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'privacy-effective-label',
                                width: 170,
                                height: 22,
                                props: { content: 'Effective date', fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 60, {
                                id: 'privacy-effective-date',
                                width: 210,
                                height: 34,
                                props: { content: 'Updated today', level: 'h3', fontSize: 24, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'settings', mode: 'legal-policy', field: 'effectiveDate', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 104, {
                                id: 'privacy-effective-copy',
                                width: 220,
                                height: 32,
                                props: { content: 'Bind this card from Settings legal metadata.', fontSize: 13, lineHeight: 1.35, color: '#64748b' },
                                responsive: {
                                    tablet: { width: 260 },
                                    mobile: { width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 320, {
                id: 'privacy-policy-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'settings', mode: 'privacy-sections', fields: ['dataCollected', 'usage', 'retention', 'processors', 'rights'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 580, width: 375, height: 1160 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'privacy-policy-heading',
                        width: 420,
                        height: 42,
                        props: { content: 'How data is handled', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Data we collect', body: 'Account details, form submissions, content edits, media metadata, and commerce/order information needed to run the site.' },
                        { title: 'How we use data', body: 'To operate the CMS, deliver public APIs, secure sessions, process orders, send notifications, and support site owners.' },
                        { title: 'Retention and deletion', body: 'Retention terms, export requests, deletion requests, and processor references should be bound from legal settings.' },
                    ].map((section, index) => createCanvasElement('box', 74 + index * 350, 132, {
                        id: `privacy-policy-card-${index}`,
                        width: 310,
                        height: 290,
                        dataBindings: [{ source: 'settings', mode: 'privacy-section', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 324, width: 660, height: 286 },
                            mobile: { x: 24, y: 112 + index * 330, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `privacy-policy-card-title-${index}`,
                                width: 230,
                                height: 34,
                                props: { content: section.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'settings', mode: 'privacy-section', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 280 },
                                    mobile: { width: 250 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: `privacy-policy-card-copy-${index}`,
                                width: 236,
                                height: 120,
                                props: { content: section.body, fontSize: 14, lineHeight: 1.55, color: '#475569' },
                                dataBindings: [{ source: 'settings', mode: 'privacy-section', index, field: 'body', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500, height: 104 },
                                    mobile: { width: 268, height: 132 },
                                },
                            }),
                            createCanvasElement('text', 24, 232, {
                                id: `privacy-policy-card-note-${index}`,
                                width: 210,
                                height: 24,
                                props: { content: 'Editable legal content', fontSize: 13, fontWeight: '800', color: '#475569' },
                                responsive: {
                                    tablet: { y: 228 },
                                    mobile: { y: 252 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 880, {
                id: 'privacy-rights-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'settings', mode: 'privacy-rights', fields: ['rights', 'contactEmail', 'requestUrl', 'processors'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 620 },
                    mobile: { y: 1740, width: 375, height: 680 },
                },
                children: [
                    createCanvasElement('box', 74, 62, {
                        id: 'privacy-rights-card',
                        width: 600,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'privacy-rights', fields: ['access', 'export', 'delete', 'correct'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 250 },
                            mobile: { x: 24, y: 46, width: 327, height: 308 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 26, {
                                id: 'privacy-rights-heading',
                                width: 320,
                                height: 34,
                                props: { content: 'Visitor rights', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, props: { fontSize: 24 } },
                                },
                            }),
                            ...['Access your data', 'Correct details', 'Request export', 'Request deletion'].map((right, index) => createCanvasElement('text', 30 + (index % 2) * 260, 86 + Math.floor(index / 2) * 42, {
                                id: `privacy-right-${index}`,
                                width: 210,
                                height: 24,
                                props: { content: right, fontSize: 15, fontWeight: '800', color: '#334155' },
                                responsive: {
                                    tablet: { x: 30 + (index % 2) * 300, y: 92 + Math.floor(index / 2) * 48, width: 240 },
                                    mobile: { x: 28, y: 86 + index * 48, width: 240 },
                                },
                            })),
                        ],
                    }),
                    createCanvasElement('box', 748, 62, {
                        id: 'privacy-contact-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'legal-contact', fields: ['contactEmail', 'requestUrl'] }],
                        props: { backgroundColor: '#111827', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 350, width: 660, height: 190 },
                            mobile: { x: 24, y: 410, width: 327, height: 214 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 26, {
                                id: 'privacy-contact-heading',
                                width: 220,
                                height: 32,
                                props: { content: 'Privacy requests', level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 26, 76, {
                                id: 'privacy-contact-copy',
                                width: 240,
                                height: 46,
                                props: { content: 'Bind the request destination to Settings or a custom frontend privacy workflow.', fontSize: 14, lineHeight: 1.45, color: '#cbd5e1' },
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('button', 26, 138, {
                                id: 'privacy-contact-button',
                                width: 158,
                                height: 40,
                                props: { label: 'Contact privacy', backgroundColor: '#e2e8f0', color: '#111827', borderRadius: 8, fontWeight: '800', action: 'privacy.request.open' },
                                responsive: {
                                    tablet: { x: 470, y: 112 },
                                    mobile: { x: 26, y: 150 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'terms') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'terms-hero-section',
                width: 1200,
                height: 320,
                dataBindings: [{ source: 'settings', mode: 'legal-terms', fields: ['terms', 'effectiveDate', 'supportEmail', 'commerceTerms'] }],
                props: { backgroundColor: '#fafafa', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 580 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'terms-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Terms', fontSize: 13, fontWeight: '800', color: '#52525b', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 200 },
                            mobile: { x: 24, y: 44, width: 180 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'terms-heading',
                        width: 660,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 80, width: 327, height: 124, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'terms-copy',
                        width: 600,
                        height: 64,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#3f3f46' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 86, {
                        id: 'terms-effective-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'settings', mode: 'legal-terms', fields: ['effectiveDate', 'version', 'jurisdiction'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#d4d4d8', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 330, height: 130 },
                            mobile: { x: 24, y: 378, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'terms-effective-label',
                                width: 170,
                                height: 22,
                                props: { content: 'Effective date', fontSize: 12, fontWeight: '800', color: '#52525b', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 60, {
                                id: 'terms-effective-date',
                                width: 210,
                                height: 34,
                                props: { content: 'Updated today', level: 'h3', fontSize: 24, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'settings', mode: 'legal-terms', field: 'effectiveDate', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 104, {
                                id: 'terms-effective-copy',
                                width: 220,
                                height: 32,
                                props: { content: 'Bind this card from Settings terms metadata.', fontSize: 13, lineHeight: 1.35, color: '#71717a' },
                                responsive: {
                                    tablet: { width: 260 },
                                    mobile: { width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 320, {
                id: 'terms-policy-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'settings', mode: 'terms-sections', fields: ['acceptableUse', 'accounts', 'commerce', 'services', 'liability'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 580, width: 375, height: 1160 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'terms-policy-heading',
                        width: 420,
                        height: 42,
                        props: { content: 'Terms overview', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Using this site', body: 'Explain acceptable use, content ownership, account responsibilities, and restrictions for public visitors and members.' },
                        { title: 'Purchases and services', body: 'Document payment, subscription, refund, cancellation, booking, and fulfillment terms for products and services.' },
                        { title: 'Changes and disputes', body: 'Describe policy changes, limitation notices, governing terms, support routes, and dispute contact expectations.' },
                    ].map((section, index) => createCanvasElement('box', 74 + index * 350, 132, {
                        id: `terms-policy-card-${index}`,
                        width: 310,
                        height: 290,
                        dataBindings: [{ source: 'settings', mode: 'terms-section', index }],
                        props: { backgroundColor: '#fafafa', borderRadius: 8, borderColor: '#e4e4e7', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 324, width: 660, height: 286 },
                            mobile: { x: 24, y: 112 + index * 330, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `terms-policy-card-title-${index}`,
                                width: 230,
                                height: 34,
                                props: { content: section.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'settings', mode: 'terms-section', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 300 },
                                    mobile: { width: 250 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: `terms-policy-card-copy-${index}`,
                                width: 236,
                                height: 120,
                                props: { content: section.body, fontSize: 14, lineHeight: 1.55, color: '#52525b' },
                                dataBindings: [{ source: 'settings', mode: 'terms-section', index, field: 'body', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500, height: 104 },
                                    mobile: { width: 268, height: 132 },
                                },
                            }),
                            createCanvasElement('text', 24, 232, {
                                id: `terms-policy-card-note-${index}`,
                                width: 210,
                                height: 24,
                                props: { content: 'Editable terms content', fontSize: 13, fontWeight: '800', color: '#52525b' },
                                responsive: {
                                    tablet: { y: 228 },
                                    mobile: { y: 252 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 880, {
                id: 'terms-contact-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'settings', mode: 'terms-contact', fields: ['supportEmail', 'requestUrl', 'commerceTerms', 'serviceTerms'] }],
                props: { backgroundColor: '#f4f4f5', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 620 },
                    mobile: { y: 1740, width: 375, height: 680 },
                },
                children: [
                    createCanvasElement('box', 74, 62, {
                        id: 'terms-acceptance-card',
                        width: 600,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'commerce-terms', fields: ['refunds', 'subscriptions', 'shipping', 'tax'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e4e4e7', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 250 },
                            mobile: { x: 24, y: 46, width: 327, height: 308 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 26, {
                                id: 'terms-acceptance-heading',
                                width: 320,
                                height: 34,
                                props: { content: 'Commerce and services', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, props: { fontSize: 24 } },
                                },
                            }),
                            ...['Refunds', 'Subscriptions', 'Shipping', 'Service scope'].map((term, index) => createCanvasElement('text', 30 + (index % 2) * 260, 86 + Math.floor(index / 2) * 42, {
                                id: `terms-acceptance-item-${index}`,
                                width: 210,
                                height: 24,
                                props: { content: term, fontSize: 15, fontWeight: '800', color: '#3f3f46' },
                                responsive: {
                                    tablet: { x: 30 + (index % 2) * 300, y: 92 + Math.floor(index / 2) * 48, width: 240 },
                                    mobile: { x: 28, y: 86 + index * 48, width: 240 },
                                },
                            })),
                        ],
                    }),
                    createCanvasElement('box', 748, 62, {
                        id: 'terms-contact-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'legal-contact', fields: ['supportEmail', 'requestUrl'] }],
                        props: { backgroundColor: '#111827', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 350, width: 660, height: 190 },
                            mobile: { x: 24, y: 410, width: 327, height: 214 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 26, {
                                id: 'terms-contact-heading',
                                width: 220,
                                height: 32,
                                props: { content: 'Questions about terms?', level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 26, 76, {
                                id: 'terms-contact-copy',
                                width: 240,
                                height: 46,
                                props: { content: 'Bind support contact details to Settings or a custom frontend legal request route.', fontSize: 14, lineHeight: 1.45, color: '#d4d4d8' },
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('button', 26, 138, {
                                id: 'terms-contact-button',
                                width: 146,
                                height: 40,
                                props: { label: 'Contact terms', backgroundColor: '#e4e4e7', color: '#111827', borderRadius: 8, fontWeight: '800', action: 'terms.contact.open' },
                                responsive: {
                                    tablet: { x: 470, y: 112 },
                                    mobile: { x: 26, y: 150 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'cookie-policy') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'cookie-policy-hero-section',
                width: 1200,
                height: 320,
                dataBindings: [{ source: 'settings', mode: 'cookie-policy', fields: ['cookieCategories', 'consentMode', 'effectiveDate', 'preferencesUrl'] }],
                props: { backgroundColor: '#fdf4ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 590 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'cookie-policy-kicker',
                        width: 230,
                        height: 28,
                        props: { content: 'Cookies and consent', fontSize: 13, fontWeight: '800', color: '#a21caf', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'cookie-policy-heading',
                        width: 660,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#701a75' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'cookie-policy-copy',
                        width: 610,
                        height: 64,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#86198f' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 86, {
                        id: 'cookie-policy-consent-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'settings', mode: 'cookie-consent', fields: ['consentMode', 'effectiveDate', 'preferencesUrl'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#f5d0fe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 330, height: 130 },
                            mobile: { x: 24, y: 388, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'cookie-policy-consent-label',
                                width: 180,
                                height: 22,
                                props: { content: 'Consent mode', fontSize: 12, fontWeight: '800', color: '#a21caf', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 60, {
                                id: 'cookie-policy-consent-value',
                                width: 220,
                                height: 34,
                                props: { content: 'Opt-in controls', level: 'h3', fontSize: 24, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'settings', mode: 'cookie-consent', field: 'consentMode', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 104, {
                                id: 'cookie-policy-consent-copy',
                                width: 230,
                                height: 32,
                                props: { content: 'Bind consent mode and effective dates from Settings legal metadata.', fontSize: 13, lineHeight: 1.35, color: '#a21caf' },
                                responsive: {
                                    tablet: { width: 260 },
                                    mobile: { width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 320, {
                id: 'cookie-policy-categories-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'settings', mode: 'cookie-categories', fields: ['essential', 'analytics', 'marketing', 'preferences', 'retention'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 590, width: 375, height: 1160 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'cookie-policy-categories-heading',
                        width: 500,
                        height: 42,
                        props: { content: 'Cookie categories', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 500 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Essential cookies', body: 'Explain cookies needed for security, sessions, checkout, consent storage, and core site functionality.' },
                        { title: 'Analytics and performance', body: 'Document measurement cookies, page analytics, product insights, retention windows, and opt-out choices.' },
                        { title: 'Marketing and preferences', body: 'List personalization, embedded media, advertising pixels, preference storage, and third-party processors.' },
                    ].map((category, index) => createCanvasElement('box', 74 + index * 350, 132, {
                        id: `cookie-policy-category-card-${index}`,
                        width: 310,
                        height: 290,
                        dataBindings: [{ source: 'settings', mode: 'cookie-category', index }],
                        props: { backgroundColor: '#fdf4ff', borderRadius: 8, borderColor: '#fae8ff', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 324, width: 660, height: 286 },
                            mobile: { x: 24, y: 112 + index * 330, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `cookie-policy-category-card-title-${index}`,
                                width: 238,
                                height: 34,
                                props: { content: category.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#701a75' },
                                dataBindings: [{ source: 'settings', mode: 'cookie-category', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 320 },
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: `cookie-policy-category-card-copy-${index}`,
                                width: 236,
                                height: 124,
                                props: { content: category.body, fontSize: 14, lineHeight: 1.55, color: '#475569' },
                                dataBindings: [{ source: 'settings', mode: 'cookie-category', index, field: 'body', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500, height: 104 },
                                    mobile: { width: 268, height: 132 },
                                },
                            }),
                            createCanvasElement('text', 24, 232, {
                                id: `cookie-policy-category-card-note-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: 'Editable consent content', fontSize: 13, fontWeight: '800', color: '#a21caf' },
                                responsive: {
                                    tablet: { y: 228 },
                                    mobile: { y: 252 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 880, {
                id: 'cookie-policy-preferences-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'settings', mode: 'cookie-preferences', fields: ['preferencesUrl', 'consentCategories', 'contactEmail', 'processors'] }],
                props: { backgroundColor: '#fdf2f8', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 620 },
                    mobile: { y: 1750, width: 375, height: 680 },
                },
                children: [
                    createCanvasElement('box', 74, 62, {
                        id: 'cookie-policy-retention-card',
                        width: 600,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'cookie-retention', fields: ['retention', 'processors', 'thirdParties', 'renewalCadence'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#fbcfe8', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 250 },
                            mobile: { x: 24, y: 46, width: 327, height: 308 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 26, {
                                id: 'cookie-policy-retention-heading',
                                width: 360,
                                height: 34,
                                props: { content: 'Retention and processors', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 64, props: { fontSize: 24 } },
                                },
                            }),
                            ...['Session cookies', 'Analytics retention', 'Third parties', 'Consent renewal'].map((item, index) => createCanvasElement('text', 30 + (index % 2) * 260, 86 + Math.floor(index / 2) * 42, {
                                id: `cookie-policy-retention-item-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: item, fontSize: 15, fontWeight: '800', color: '#86198f' },
                                responsive: {
                                    tablet: { x: 30 + (index % 2) * 300, y: 92 + Math.floor(index / 2) * 48, width: 240 },
                                    mobile: { x: 28, y: 104 + index * 44, width: 240 },
                                },
                            })),
                        ],
                    }),
                    createCanvasElement('box', 748, 62, {
                        id: 'cookie-policy-preferences-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'cookie-preferences-action', fields: ['preferencesUrl', 'contactEmail'] }],
                        props: { backgroundColor: '#701a75', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 350, width: 660, height: 190 },
                            mobile: { x: 24, y: 410, width: 327, height: 214 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 26, {
                                id: 'cookie-policy-preferences-heading',
                                width: 230,
                                height: 32,
                                props: { content: 'Manage preferences', level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 26, 76, {
                                id: 'cookie-policy-preferences-copy',
                                width: 250,
                                height: 46,
                                props: { content: 'Bind this action to a consent banner, settings modal, or external preference center.', fontSize: 14, lineHeight: 1.45, color: '#f5d0fe' },
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('button', 26, 138, {
                                id: 'cookie-policy-preferences-button',
                                width: 178,
                                height: 40,
                                props: { label: 'Manage cookies', backgroundColor: '#f5d0fe', color: '#701a75', borderRadius: 8, fontWeight: '800', action: 'cookies.preferences.open' },
                                responsive: {
                                    tablet: { x: 470, y: 112 },
                                    mobile: { x: 26, y: 150 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'accessibility-statement') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'accessibility-statement-hero-section',
                width: 1200,
                height: 320,
                dataBindings: [{ source: 'settings', mode: 'accessibility-statement', fields: ['standard', 'conformanceLevel', 'lastReviewedAt', 'contactEmail'] }],
                props: { backgroundColor: '#eef2ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 590 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'accessibility-statement-kicker',
                        width: 260,
                        height: 28,
                        props: { content: 'Accessibility', fontSize: 13, fontWeight: '800', color: '#4338ca', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'accessibility-statement-heading',
                        width: 680,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#312e81' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'accessibility-statement-copy',
                        width: 620,
                        height: 64,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#4338ca' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 86, {
                        id: 'accessibility-statement-standard-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'settings', mode: 'accessibility-standard', fields: ['standard', 'conformanceLevel', 'lastReviewedAt'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#c7d2fe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 330, height: 130 },
                            mobile: { x: 24, y: 388, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'accessibility-statement-standard-label',
                                width: 180,
                                height: 22,
                                props: { content: 'Target standard', fontSize: 12, fontWeight: '800', color: '#4338ca', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 60, {
                                id: 'accessibility-statement-standard-value',
                                width: 220,
                                height: 34,
                                props: { content: 'WCAG 2.2 AA', level: 'h3', fontSize: 24, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'settings', mode: 'accessibility-standard', field: 'standard', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 104, {
                                id: 'accessibility-statement-standard-copy',
                                width: 230,
                                height: 32,
                                props: { content: 'Bind standards and review dates from site accessibility settings.', fontSize: 13, lineHeight: 1.35, color: '#4338ca' },
                                responsive: {
                                    tablet: { width: 260 },
                                    mobile: { width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 320, {
                id: 'accessibility-statement-support-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'settings', mode: 'accessibility-support', fields: ['keyboard', 'screenReaders', 'mediaAlternatives', 'knownLimitations'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 590, width: 375, height: 1160 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'accessibility-statement-support-heading',
                        width: 520,
                        height: 42,
                        props: { content: 'Supported accessibility features', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 520 },
                            mobile: { x: 24, y: 42, width: 320, height: 72, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Keyboard and focus', body: 'Document keyboard navigation, visible focus states, skip links, form labels, and predictable page structure.' },
                        { title: 'Assistive technology', body: 'Explain screen-reader support, semantic landmarks, alt text, captions, transcripts, and accessible embeds.' },
                        { title: 'Known limitations', body: 'List third-party widgets, legacy content, media gaps, documents, or integrations that still need remediation.' },
                    ].map((item, index) => createCanvasElement('box', 74 + index * 350, 132, {
                        id: `accessibility-statement-support-card-${index}`,
                        width: 310,
                        height: 290,
                        dataBindings: [{ source: 'settings', mode: 'accessibility-support-item', index }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e0e7ff', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 324, width: 660, height: 286 },
                            mobile: { x: 24, y: 134 + index * 330, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `accessibility-statement-support-card-title-${index}`,
                                width: 238,
                                height: 34,
                                props: { content: item.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#312e81' },
                                dataBindings: [{ source: 'settings', mode: 'accessibility-support-item', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 320 },
                                    mobile: { width: 260, height: 52 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: `accessibility-statement-support-card-copy-${index}`,
                                width: 236,
                                height: 124,
                                props: { content: item.body, fontSize: 14, lineHeight: 1.55, color: '#475569' },
                                dataBindings: [{ source: 'settings', mode: 'accessibility-support-item', index, field: 'body', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500, height: 104 },
                                    mobile: { width: 268, height: 132 },
                                },
                            }),
                            createCanvasElement('text', 24, 232, {
                                id: `accessibility-statement-support-card-note-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: 'Editable accessibility content', fontSize: 13, fontWeight: '800', color: '#4338ca' },
                                responsive: {
                                    tablet: { y: 228 },
                                    mobile: { y: 252 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 880, {
                id: 'accessibility-statement-feedback-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'settings', mode: 'accessibility-feedback', fields: ['contactEmail', 'feedbackUrl', 'responseTime', 'remediationPlan'] }],
                props: { backgroundColor: '#f5f3ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 620 },
                    mobile: { y: 1750, width: 375, height: 680 },
                },
                children: [
                    createCanvasElement('box', 74, 62, {
                        id: 'accessibility-statement-review-card',
                        width: 600,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'accessibility-review', fields: ['lastReviewedAt', 'auditCadence', 'remediationPlan', 'owner'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#ddd6fe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 250 },
                            mobile: { x: 24, y: 46, width: 327, height: 308 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 26, {
                                id: 'accessibility-statement-review-heading',
                                width: 360,
                                height: 34,
                                props: { content: 'Review and remediation', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 64, props: { fontSize: 24 } },
                                },
                            }),
                            ...['Last review', 'Audit cadence', 'Issue owner', 'Remediation plan'].map((item, index) => createCanvasElement('text', 30 + (index % 2) * 260, 86 + Math.floor(index / 2) * 42, {
                                id: `accessibility-statement-review-item-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: item, fontSize: 15, fontWeight: '800', color: '#4338ca' },
                                responsive: {
                                    tablet: { x: 30 + (index % 2) * 300, y: 92 + Math.floor(index / 2) * 48, width: 240 },
                                    mobile: { x: 28, y: 104 + index * 44, width: 240 },
                                },
                            })),
                        ],
                    }),
                    createCanvasElement('box', 748, 62, {
                        id: 'accessibility-statement-feedback-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'settings', mode: 'accessibility-feedback-action', fields: ['feedbackUrl', 'contactEmail'] }],
                        props: { backgroundColor: '#312e81', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 350, width: 660, height: 190 },
                            mobile: { x: 24, y: 410, width: 327, height: 214 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 26, {
                                id: 'accessibility-statement-feedback-heading',
                                width: 240,
                                height: 32,
                                props: { content: 'Accessibility feedback', level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 26, 76, {
                                id: 'accessibility-statement-feedback-copy',
                                width: 250,
                                height: 46,
                                props: { content: 'Bind this action to an accessibility request form, support email, or feedback workflow.', fontSize: 14, lineHeight: 1.45, color: '#e0e7ff' },
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('button', 26, 138, {
                                id: 'accessibility-statement-feedback-button',
                                width: 156,
                                height: 40,
                                props: { label: 'Send feedback', backgroundColor: '#e0e7ff', color: '#312e81', borderRadius: 8, fontWeight: '800', action: 'accessibility.feedback.open' },
                                responsive: {
                                    tablet: { x: 470, y: 112 },
                                    mobile: { x: 26, y: 150 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'refund-policy') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'refund-policy-hero-section',
                width: 1200,
                height: 320,
                dataBindings: [{ source: 'commerce', mode: 'refund-policy', fields: ['returnWindowDays', 'refundMethods', 'exchangeAllowed', 'supportEmail'] }],
                props: { backgroundColor: '#ecfdf5', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 590 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'refund-policy-kicker',
                        width: 240,
                        height: 28,
                        props: { content: 'Refunds and returns', fontSize: 13, fontWeight: '800', color: '#047857', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'refund-policy-heading',
                        width: 660,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#064e3b' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'refund-policy-copy',
                        width: 610,
                        height: 64,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#065f46' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 86, {
                        id: 'refund-policy-window-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'commerce', mode: 'refund-window', fields: ['returnWindowDays', 'refundMethod', 'exchangeAllowed'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#a7f3d0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 330, height: 130 },
                            mobile: { x: 24, y: 388, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'refund-policy-window-label',
                                width: 180,
                                height: 22,
                                props: { content: 'Return window', fontSize: 12, fontWeight: '800', color: '#047857', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 60, {
                                id: 'refund-policy-window-value',
                                width: 210,
                                height: 34,
                                props: { content: '30 days', level: 'h3', fontSize: 26, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'commerce', mode: 'refund-window', field: 'returnWindowDays', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 104, {
                                id: 'refund-policy-window-copy',
                                width: 230,
                                height: 32,
                                props: { content: 'Bind this from commerce policy settings or order support workflows.', fontSize: 13, lineHeight: 1.35, color: '#047857' },
                                responsive: {
                                    tablet: { width: 260 },
                                    mobile: { width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 320, {
                id: 'refund-policy-rules-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'commerce', mode: 'refund-rules', fields: ['eligibility', 'refundMethods', 'exchangeRules', 'ineligibleItems'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 590, width: 375, height: 1160 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'refund-policy-rules-heading',
                        width: 470,
                        height: 42,
                        props: { content: 'Policy rules', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 470 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Return eligibility', body: 'Explain the condition, receipt, order number, and timeline requirements customers must meet before starting a return.' },
                        { title: 'Refunds and exchanges', body: 'Document store credit, original-payment refunds, exchange options, restocking fees, and processing timelines.' },
                        { title: 'Items not eligible', body: 'List final-sale, digital, customized, opened, damaged, or hygiene-sensitive products that need special handling.' },
                    ].map((rule, index) => createCanvasElement('box', 74 + index * 350, 132, {
                        id: `refund-policy-rule-card-${index}`,
                        width: 310,
                        height: 290,
                        dataBindings: [{ source: 'commerce', mode: 'refund-rule', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#d1fae5', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 324, width: 660, height: 286 },
                            mobile: { x: 24, y: 112 + index * 330, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `refund-policy-rule-card-title-${index}`,
                                width: 230,
                                height: 34,
                                props: { content: rule.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#064e3b' },
                                dataBindings: [{ source: 'commerce', mode: 'refund-rule', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 320 },
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: `refund-policy-rule-card-copy-${index}`,
                                width: 236,
                                height: 124,
                                props: { content: rule.body, fontSize: 14, lineHeight: 1.55, color: '#475569' },
                                dataBindings: [{ source: 'commerce', mode: 'refund-rule', index, field: 'body', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500, height: 104 },
                                    mobile: { width: 268, height: 132 },
                                },
                            }),
                            createCanvasElement('text', 24, 232, {
                                id: `refund-policy-rule-card-note-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: 'Editable commerce policy', fontSize: 13, fontWeight: '800', color: '#047857' },
                                responsive: {
                                    tablet: { y: 228 },
                                    mobile: { y: 252 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 880, {
                id: 'refund-policy-actions-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'commerce', mode: 'refund-actions', fields: ['returnUrl', 'supportEmail', 'orderLookupRequired', 'refundMethod'] }],
                props: { backgroundColor: '#f0fdf4', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 620 },
                    mobile: { y: 1750, width: 375, height: 680 },
                },
                children: [
                    createCanvasElement('box', 74, 62, {
                        id: 'refund-policy-eligibility-card',
                        width: 600,
                        height: 190,
                        dataBindings: [{ source: 'commerce', mode: 'refund-eligibility', fields: ['orderNumber', 'productCondition', 'photosRequired', 'labelProvider'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bbf7d0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 250 },
                            mobile: { x: 24, y: 46, width: 327, height: 308 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 26, {
                                id: 'refund-policy-eligibility-heading',
                                width: 360,
                                height: 34,
                                props: { content: 'Before customers start', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 64, props: { fontSize: 24 } },
                                },
                            }),
                            ...['Order number', 'Product condition', 'Photos if needed', 'Return label steps'].map((step, index) => createCanvasElement('text', 30 + (index % 2) * 260, 86 + Math.floor(index / 2) * 42, {
                                id: `refund-policy-eligibility-item-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: step, fontSize: 15, fontWeight: '800', color: '#065f46' },
                                responsive: {
                                    tablet: { x: 30 + (index % 2) * 300, y: 92 + Math.floor(index / 2) * 48, width: 240 },
                                    mobile: { x: 28, y: 104 + index * 44, width: 240 },
                                },
                            })),
                        ],
                    }),
                    createCanvasElement('box', 748, 62, {
                        id: 'refund-policy-contact-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'commerce', mode: 'refund-contact', fields: ['returnUrl', 'supportEmail', 'orderLookupUrl'] }],
                        props: { backgroundColor: '#064e3b', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 350, width: 660, height: 190 },
                            mobile: { x: 24, y: 410, width: 327, height: 214 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 26, {
                                id: 'refund-policy-contact-heading',
                                width: 230,
                                height: 32,
                                props: { content: 'Need to return an order?', level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 26, 76, {
                                id: 'refund-policy-contact-copy',
                                width: 250,
                                height: 46,
                                props: { content: 'Bind this action to a return portal, order lookup, form, or support workflow.', fontSize: 14, lineHeight: 1.45, color: '#d1fae5' },
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('button', 26, 138, {
                                id: 'refund-policy-contact-button',
                                width: 144,
                                height: 40,
                                props: { label: 'Start return', backgroundColor: '#d1fae5', color: '#064e3b', borderRadius: 8, fontWeight: '800', action: 'refund.request.open' },
                                responsive: {
                                    tablet: { x: 470, y: 112 },
                                    mobile: { x: 26, y: 150 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'shipping-policy') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'shipping-policy-hero-section',
                width: 1200,
                height: 320,
                dataBindings: [{ source: 'commerce', mode: 'shipping-policy', fields: ['shippingZones', 'deliveryMethods', 'rates', 'trackingUrl'] }],
                props: { backgroundColor: '#f0f9ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 590 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'shipping-policy-kicker',
                        width: 240,
                        height: 28,
                        props: { content: 'Shipping and delivery', fontSize: 13, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'shipping-policy-heading',
                        width: 660,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#0c4a6e' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'shipping-policy-copy',
                        width: 610,
                        height: 64,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#075985' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 86, {
                        id: 'shipping-policy-timeline-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'commerce', mode: 'shipping-timeline', fields: ['processingDays', 'standardDeliveryDays', 'expressDeliveryDays'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bae6fd', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 330, height: 130 },
                            mobile: { x: 24, y: 388, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'shipping-policy-timeline-label',
                                width: 190,
                                height: 22,
                                props: { content: 'Typical delivery', fontSize: 12, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 24, 60, {
                                id: 'shipping-policy-timeline-value',
                                width: 220,
                                height: 34,
                                props: { content: '3-7 business days', level: 'h3', fontSize: 24, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'commerce', mode: 'shipping-timeline', field: 'standardDeliveryDays', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 104, {
                                id: 'shipping-policy-timeline-copy',
                                width: 230,
                                height: 32,
                                props: { content: 'Bind delivery estimates from Settings, carrier rates, or fulfillment rules.', fontSize: 13, lineHeight: 1.35, color: '#0369a1' },
                                responsive: {
                                    tablet: { width: 260 },
                                    mobile: { width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 320, {
                id: 'shipping-policy-methods-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'commerce', mode: 'shipping-methods', fields: ['methods', 'rates', 'zones', 'cutoffTimes', 'pickup'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 590, width: 375, height: 1160 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'shipping-policy-methods-heading',
                        width: 500,
                        height: 42,
                        props: { content: 'Delivery options', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 500 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Standard delivery', body: 'Explain processing time, standard carrier options, rate thresholds, free-shipping rules, and delivery windows.' },
                        { title: 'Express and pickup', body: 'Document express cutoff times, local pickup instructions, store pickup windows, and same-day constraints.' },
                        { title: 'International shipping', body: 'List available regions, duties, customs notes, restricted destinations, and expected cross-border timing.' },
                    ].map((method, index) => createCanvasElement('box', 74 + index * 350, 132, {
                        id: `shipping-policy-method-card-${index}`,
                        width: 310,
                        height: 290,
                        dataBindings: [{ source: 'commerce', mode: 'shipping-method', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#dbeafe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 324, width: 660, height: 286 },
                            mobile: { x: 24, y: 112 + index * 330, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: `shipping-policy-method-card-title-${index}`,
                                width: 238,
                                height: 34,
                                props: { content: method.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#0c4a6e' },
                                dataBindings: [{ source: 'commerce', mode: 'shipping-method', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 320 },
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: `shipping-policy-method-card-copy-${index}`,
                                width: 236,
                                height: 124,
                                props: { content: method.body, fontSize: 14, lineHeight: 1.55, color: '#475569' },
                                dataBindings: [{ source: 'commerce', mode: 'shipping-method', index, field: 'body', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500, height: 104 },
                                    mobile: { width: 268, height: 132 },
                                },
                            }),
                            createCanvasElement('text', 24, 232, {
                                id: `shipping-policy-method-card-note-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: 'Editable shipping content', fontSize: 13, fontWeight: '800', color: '#0369a1' },
                                responsive: {
                                    tablet: { y: 228 },
                                    mobile: { y: 252 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 880, {
                id: 'shipping-policy-actions-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'commerce', mode: 'shipping-actions', fields: ['trackingUrl', 'supportEmail', 'orderLookupUrl', 'carrierProviders'] }],
                props: { backgroundColor: '#eff6ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 620 },
                    mobile: { y: 1750, width: 375, height: 680 },
                },
                children: [
                    createCanvasElement('box', 74, 62, {
                        id: 'shipping-policy-tracking-card',
                        width: 600,
                        height: 190,
                        dataBindings: [{ source: 'commerce', mode: 'shipping-tracking', fields: ['trackingUrl', 'carrier', 'orderLookupRequired', 'notificationEvents'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bfdbfe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 250 },
                            mobile: { x: 24, y: 46, width: 327, height: 308 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 26, {
                                id: 'shipping-policy-tracking-heading',
                                width: 360,
                                height: 34,
                                props: { content: 'Tracking and delivery support', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 64, props: { fontSize: 24 } },
                                },
                            }),
                            ...['Tracking link', 'Carrier updates', 'Delivery issues', 'Address changes'].map((step, index) => createCanvasElement('text', 30 + (index % 2) * 260, 86 + Math.floor(index / 2) * 42, {
                                id: `shipping-policy-tracking-item-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: step, fontSize: 15, fontWeight: '800', color: '#075985' },
                                responsive: {
                                    tablet: { x: 30 + (index % 2) * 300, y: 92 + Math.floor(index / 2) * 48, width: 240 },
                                    mobile: { x: 28, y: 104 + index * 44, width: 240 },
                                },
                            })),
                        ],
                    }),
                    createCanvasElement('box', 748, 62, {
                        id: 'shipping-policy-contact-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'commerce', mode: 'shipping-contact', fields: ['trackingUrl', 'supportEmail', 'orderLookupUrl'] }],
                        props: { backgroundColor: '#0c4a6e', borderRadius: 8 },
                        responsive: {
                            tablet: { x: 54, y: 350, width: 660, height: 190 },
                            mobile: { x: 24, y: 410, width: 327, height: 214 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 26, {
                                id: 'shipping-policy-contact-heading',
                                width: 230,
                                height: 32,
                                props: { content: 'Track an order', level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 26, 76, {
                                id: 'shipping-policy-contact-copy',
                                width: 250,
                                height: 46,
                                props: { content: 'Bind this action to order lookup, carrier tracking, or a support handoff.', fontSize: 14, lineHeight: 1.45, color: '#dbeafe' },
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('button', 26, 138, {
                                id: 'shipping-policy-contact-button',
                                width: 136,
                                height: 40,
                                props: { label: 'Track order', backgroundColor: '#dbeafe', color: '#0c4a6e', borderRadius: 8, fontWeight: '800', action: 'shipping.tracking.open' },
                                responsive: {
                                    tablet: { x: 470, y: 112 },
                                    mobile: { x: 26, y: 150 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'cart') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'cart-hero-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'commerce', mode: 'cart', fields: ['items', 'itemCount', 'subtotal', 'discount', 'shipping', 'tax', 'total'] }],
                props: { backgroundColor: '#f0fdfa', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 430 },
                    mobile: { width: 375, height: 560 },
                },
                children: [
                    createCanvasElement('text', 76, 58, {
                        id: 'cart-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Cart review', fontSize: 13, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'cart-heading',
                        width: 560,
                        height: 86,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#0f172a' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 120, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 198, {
                        id: 'cart-copy',
                        width: 560,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#334155' },
                        responsive: {
                            tablet: { x: 56, y: 194, width: 480, height: 70, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 222, width: 323, height: 100, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 768, 72, {
                        id: 'cart-status-card',
                        width: 300,
                        height: 132,
                        dataBindings: [{ source: 'commerce', mode: 'cart-summary', fields: ['itemCount', 'total'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#99f6e4', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 300, width: 330, height: 112 },
                            mobile: { x: 24, y: 390, width: 327, height: 122 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'cart-status-label',
                                width: 180,
                                height: 24,
                                props: { content: 'Items in cart', fontSize: 14, fontWeight: '700', color: '#0f766e' },
                            }),
                            createCanvasElement('heading', 24, 58, {
                                id: 'cart-status-count',
                                width: 150,
                                height: 44,
                                props: { content: '3 items', level: 'h2', fontSize: 32, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'commerce', mode: 'cart-summary', field: 'itemCount', targetPath: 'props.content' }],
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 300, {
                id: 'cart-items-section',
                width: 1200,
                height: 520,
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 430, width: 768, height: 930 },
                    mobile: { y: 560, width: 375, height: 1160 },
                },
                children: [
                    createCanvasElement('heading', 72, 52, {
                        id: 'cart-items-heading',
                        width: 340,
                        height: 42,
                        props: { content: 'Your items', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 340 },
                            mobile: { x: 24, y: 42, width: 300, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('box', 72, 120, {
                        id: 'cart-item-list',
                        width: 660,
                        height: 330,
                        dataBindings: [{ source: 'commerce', mode: 'cart-items', limit: 10 }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 118, width: 660, height: 330 },
                            mobile: { x: 24, y: 110, width: 327, height: 530 },
                        },
                        children: ['Digital kit', 'Service package', 'Consultation'].map((item, index) => createCanvasElement('box', 20, 20 + index * 98, {
                            id: `cart-item-row-${index}`,
                            width: 620,
                            height: 78,
                            dataBindings: [{ source: 'commerce', mode: 'cart-item', index }],
                            props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                            responsive: {
                                mobile: { x: 20, y: 20 + index * 160, width: 287, height: 150 },
                            },
                            children: [
                                createCanvasElement('heading', 18, 15, {
                                    id: `cart-item-title-${index}`,
                                    width: 230,
                                    height: 28,
                                    props: { content: item, level: 'h3', fontSize: 18, fontWeight: '750', color: '#111827' },
                                    dataBindings: [{ source: 'commerce', mode: 'cart-item', index, field: 'title', targetPath: 'props.content' }],
                                    responsive: {
                                        mobile: { width: 240 },
                                    },
                                }),
                                createCanvasElement('text', 18, 48, {
                                    id: `cart-item-price-${index}`,
                                    width: 90,
                                    height: 22,
                                    props: { content: '$49.00', fontSize: 14, fontWeight: '700', color: '#0f766e' },
                                    dataBindings: [{ source: 'commerce', mode: 'cart-item', index, field: 'price', targetPath: 'props.content' }],
                                    responsive: {
                                        mobile: { y: 50 },
                                    },
                                }),
                                createCanvasElement('input', 322, 18, {
                                    id: `cart-quantity-control-${index}`,
                                    width: 94,
                                    height: 44,
                                    props: { label: 'Qty', name: `quantity_${index}`, inputType: 'number', value: '1', min: 1 },
                                    dataBindings: [{ source: 'commerce', mode: 'cart-item', index, field: 'quantity', targetPath: 'props.value' }],
                                    responsive: {
                                        mobile: { x: 18, y: 84, width: 94, height: 44 },
                                    },
                                }),
                                createCanvasElement('text', 450, 26, {
                                    id: `cart-item-total-${index}`,
                                    width: 80,
                                    height: 24,
                                    props: { content: '$49.00', fontSize: 15, fontWeight: '800', color: '#111827', textAlign: 'right' },
                                    dataBindings: [{ source: 'commerce', mode: 'cart-item', index, field: 'lineTotal', targetPath: 'props.content' }],
                                    responsive: {
                                        mobile: { x: 120, y: 94, width: 70 },
                                    },
                                }),
                                createCanvasElement('button', 542, 22, {
                                    id: `cart-remove-button-${index}`,
                                    width: 58,
                                    height: 36,
                                    props: { label: 'Remove', backgroundColor: '#f1f5f9', color: '#334155', borderRadius: 8, fontSize: 12, fontWeight: '700', action: 'commerce.cart.remove' },
                                    responsive: {
                                        mobile: { x: 204, y: 86, width: 68, height: 44 },
                                    },
                                }),
                            ],
                        })),
                    }),
                    createCanvasElement('box', 790, 120, {
                        id: 'cart-summary-card',
                        width: 330,
                        height: 330,
                        dataBindings: [{ source: 'commerce', mode: 'cart-summary', fields: ['subtotal', 'discount', 'shipping', 'tax', 'total'] }],
                        props: { backgroundColor: '#111827', borderRadius: 8, color: '#ffffff', padding: 0 },
                        responsive: {
                            tablet: { x: 54, y: 500, width: 660, height: 330 },
                            mobile: { x: 24, y: 680, width: 327, height: 350 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'cart-summary-heading',
                                width: 220,
                                height: 34,
                                props: { content: 'Cart totals', level: 'h2', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            ...['Subtotal', 'Discount', 'Shipping', 'Estimated tax'].map((item, index) => createCanvasElement('text', 24, 86 + index * 36, {
                                id: `cart-summary-label-${index}`,
                                width: 160,
                                height: 22,
                                props: { content: item, fontSize: 14, color: '#d1d5db' },
                            })),
                            ...['$147.00', '-$10.00', '$6.00', '$11.44'].map((item, index) => createCanvasElement('text', 224, 86 + index * 36, {
                                id: `cart-summary-value-${index}`,
                                width: 70,
                                height: 22,
                                props: { content: item, fontSize: 14, fontWeight: '700', color: '#ffffff', textAlign: 'right' },
                                responsive: {
                                    tablet: { x: 540, width: 80 },
                                    mobile: { x: 214, width: 70 },
                                },
                            })),
                            createCanvasElement('text', 24, 244, {
                                id: 'cart-total-label',
                                width: 100,
                                height: 30,
                                props: { content: 'Total', fontSize: 20, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('text', 206, 244, {
                                id: 'cart-total-value',
                                width: 88,
                                height: 30,
                                props: { content: '$154.44', fontSize: 20, fontWeight: '800', color: '#99f6e4', textAlign: 'right' },
                                dataBindings: [{ source: 'commerce', mode: 'cart-summary', field: 'total', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { x: 530, width: 90 },
                                    mobile: { x: 200, width: 94 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 820, {
                id: 'cart-actions-section',
                width: 1200,
                height: 220,
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1360, width: 768, height: 300 },
                    mobile: { y: 1720, width: 375, height: 420 },
                },
                children: [
                    createCanvasElement('button', 72, 70, {
                        id: 'cart-continue-shopping-button',
                        width: 190,
                        height: 52,
                        props: { label: 'Continue shopping', href: '/store', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 8, borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid', fontSize: 16, fontWeight: '700' },
                        responsive: {
                            tablet: { x: 54, y: 66 },
                            mobile: { x: 24, y: 54, width: 327, height: 52 },
                        },
                    }),
                    createCanvasElement('button', 828, 70, {
                        id: 'cart-checkout-button',
                        width: 220,
                        height: 54,
                        props: { label: 'Proceed to checkout', href: '/checkout', backgroundColor: '#0f766e', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: '800', action: 'commerce.checkout' },
                        responsive: {
                            tablet: { x: 494, y: 66 },
                            mobile: { x: 24, y: 126, width: 327, height: 54 },
                        },
                    }),
                    createCanvasElement('paragraph', 828, 142, {
                        id: 'cart-checkout-copy',
                        width: 280,
                        height: 44,
                        props: { content: 'Checkout can use Backy public order intake plus your configured payment, tax, shipping, and discount providers.', fontSize: 13, lineHeight: 1.45, color: '#64748b' },
                        responsive: {
                            tablet: { x: 388, y: 140, width: 326, height: 60 },
                            mobile: { x: 26, y: 210, width: 323, height: 78 },
                        },
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'checkout') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'checkout-hero-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'commerce', mode: 'checkout', fields: ['cartItems', 'subtotal', 'shipping', 'tax', 'total'] }],
                props: { backgroundColor: '#ecfdf5', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 590 },
                },
                children: [
                    createCanvasElement('text', 76, 62, {
                        id: 'checkout-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Secure checkout', fontSize: 13, fontWeight: '800', color: '#047857', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 100, {
                        id: 'checkout-heading',
                        width: 600,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#064e3b' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 86, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 214, {
                        id: 'checkout-copy',
                        width: 560,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#065f46' },
                        responsive: {
                            tablet: { x: 56, y: 198, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 748, 78, {
                        id: 'checkout-provider-note',
                        width: 330,
                        height: 150,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#a7f3d0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 360, height: 130 },
                            mobile: { x: 24, y: 388, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('heading', 22, 22, {
                                id: 'checkout-provider-heading',
                                width: 240,
                                height: 34,
                                props: { content: 'Payment provider handoff', level: 'h3', fontSize: 20, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 22, 70, {
                                id: 'checkout-provider-copy',
                                width: 262,
                                height: 56,
                                props: { content: 'Collect customer and shipping details here, then send payment through Stripe, PayPal, Razorpay, or another configured provider.', fontSize: 13, lineHeight: 1.45, color: '#475569' },
                                responsive: {
                                    tablet: { width: 300 },
                                    mobile: { width: 270 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 330, {
                id: 'checkout-main-section',
                width: 1200,
                height: 470,
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 820 },
                    mobile: { y: 590, width: 375, height: 840 },
                },
                children: [
                    createCanvasElement('box', 72, 58, {
                        id: 'checkout-customer-card',
                        width: 500,
                        height: 340,
                        dataBindings: [{ source: 'commerce', mode: 'checkout-customer', fields: ['email', 'shippingAddress', 'billingAddress'] }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 340 },
                            mobile: { x: 24, y: 46, width: 327, height: 388 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'checkout-customer-heading',
                                width: 260,
                                height: 34,
                                props: { content: 'Customer details', level: 'h2', fontSize: 24, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('input', 24, 84, {
                                id: 'checkout-email',
                                width: 420,
                                height: 54,
                                props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true },
                                responsive: {
                                    tablet: { width: 560 },
                                    mobile: { width: 279 },
                                },
                            }),
                            createCanvasElement('input', 24, 154, {
                                id: 'checkout-shipping-address',
                                width: 420,
                                height: 54,
                                props: { label: 'Shipping address', name: 'shipping_address', placeholder: 'Street, city, region', required: true },
                                responsive: {
                                    tablet: { width: 560 },
                                    mobile: { width: 279 },
                                },
                            }),
                            createCanvasElement('select', 24, 224, {
                                id: 'checkout-shipping-method',
                                width: 260,
                                height: 54,
                                props: { label: 'Shipping method', name: 'shipping_method', options: ['Standard', 'Express', 'Pickup'], placeholder: 'Choose shipping' },
                                responsive: {
                                    tablet: { width: 360 },
                                    mobile: { width: 279 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 648, 58, {
                        id: 'checkout-order-summary',
                        width: 420,
                        height: 340,
                        dataBindings: [{ source: 'commerce', mode: 'cart-summary', fields: ['items', 'subtotal', 'discount', 'shipping', 'tax', 'total'] }],
                        props: { backgroundColor: '#111827', borderRadius: 8, color: '#ffffff', padding: 0 },
                        responsive: {
                            tablet: { x: 54, y: 450, width: 660, height: 300 },
                            mobile: { x: 24, y: 482, width: 327, height: 310 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'checkout-summary-heading',
                                width: 240,
                                height: 34,
                                props: { content: 'Order summary', level: 'h2', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            ...['Product subtotal', 'Shipping', 'Estimated tax'].map((item, index) => createCanvasElement('text', 24, 86 + index * 44, {
                                id: `checkout-summary-line-${index}`,
                                width: 240,
                                height: 24,
                                props: { content: item, fontSize: 15, color: '#d1d5db' },
                            })),
                            ...['$49.00', '$6.00', '$4.40'].map((item, index) => createCanvasElement('text', 302, 86 + index * 44, {
                                id: `checkout-summary-value-${index}`,
                                width: 72,
                                height: 24,
                                props: { content: item, fontSize: 15, fontWeight: '700', color: '#ffffff', textAlign: 'right' },
                                responsive: {
                                    tablet: { x: 540, width: 80 },
                                    mobile: { x: 214, width: 70 },
                                },
                            })),
                            createCanvasElement('text', 24, 238, {
                                id: 'checkout-total-label',
                                width: 160,
                                height: 30,
                                props: { content: 'Total', fontSize: 20, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('text', 292, 238, {
                                id: 'checkout-total-value',
                                width: 88,
                                height: 30,
                                props: { content: '$59.40', fontSize: 20, fontWeight: '800', color: '#a7f3d0', textAlign: 'right' },
                                dataBindings: [{ source: 'commerce', mode: 'cart-summary', field: 'total', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { x: 530, width: 90 },
                                    mobile: { x: 200, width: 94 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 800, {
                id: 'checkout-payment-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'commerce', mode: 'payment-provider', fields: ['provider', 'status', 'checkoutUrl'] }],
                props: { backgroundColor: '#f9fafb', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1280, width: 768, height: 360 },
                    mobile: { y: 1430, width: 375, height: 430 },
                },
                children: [
                    createCanvasElement('heading', 72, 54, {
                        id: 'checkout-payment-heading',
                        width: 440,
                        height: 44,
                        props: { content: 'Complete payment', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 440 },
                            mobile: { x: 24, y: 46, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 118, {
                        id: 'checkout-payment-copy',
                        width: 560,
                        height: 70,
                        props: { content: 'Use this button to launch the configured provider checkout session. Keep card fields inside the provider flow, not inside Backy page forms.', fontSize: 16, lineHeight: 1.55, color: '#4b5563' },
                        responsive: {
                            tablet: { x: 56, y: 118, width: 520, height: 70 },
                            mobile: { x: 26, y: 106, width: 323, height: 104 },
                        },
                    }),
                    createCanvasElement('button', 720, 82, {
                        id: 'checkout-payment-button',
                        width: 220,
                        height: 56,
                        props: { label: 'Continue to payment', backgroundColor: '#047857', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: '800', action: 'commerce.checkout' },
                        responsive: {
                            tablet: { x: 54, y: 220, width: 260 },
                            mobile: { x: 24, y: 238, width: 327, height: 56 },
                        },
                    }),
                    createCanvasElement('text', 720, 158, {
                        id: 'checkout-payment-safe-note',
                        width: 300,
                        height: 44,
                        props: { content: 'No card number, CVV, or raw payment secret is collected by this page starter.', fontSize: 13, lineHeight: 1.45, color: '#6b7280' },
                        responsive: {
                            tablet: { x: 338, y: 226, width: 320 },
                            mobile: { x: 26, y: 318, width: 323, height: 54 },
                        },
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'order-confirmation') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'order-confirmation-hero-section',
                width: 1200,
                height: 380,
                dataBindings: [{ source: 'commerce', mode: 'order-confirmation', fields: ['orderId', 'status', 'customerEmail', 'total', 'createdAt'] }],
                props: { backgroundColor: '#f0fdf4', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 500 },
                    mobile: { width: 375, height: 610 },
                },
                children: [
                    createCanvasElement('text', 76, 66, {
                        id: 'order-confirmation-kicker',
                        width: 240,
                        height: 28,
                        props: { content: 'Order received', fontSize: 13, fontWeight: '800', color: '#15803d', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 106, {
                        id: 'order-confirmation-heading',
                        width: 620,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#052e16' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 500, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 142, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 222, {
                        id: 'order-confirmation-copy',
                        width: 560,
                        height: 72,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#166534' },
                        responsive: {
                            tablet: { x: 56, y: 204, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 246, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 748, 78, {
                        id: 'order-confirmation-status-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'commerce', mode: 'order-status', fields: ['orderId', 'status', 'total'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bbf7d0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 320, width: 360, height: 150 },
                            mobile: { x: 24, y: 410, width: 327, height: 154 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: 'order-confirmation-status-label',
                                width: 160,
                                height: 24,
                                props: { content: 'Status', fontSize: 14, fontWeight: '800', color: '#15803d' },
                            }),
                            createCanvasElement('heading', 24, 58, {
                                id: 'order-confirmation-status',
                                width: 220,
                                height: 44,
                                props: { content: 'Paid', level: 'h2', fontSize: 32, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'commerce', mode: 'order-status', field: 'status', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('text', 24, 124, {
                                id: 'order-confirmation-number',
                                width: 240,
                                height: 26,
                                props: { content: 'Order #1001', fontSize: 16, fontWeight: '700', color: '#334155' },
                                dataBindings: [{ source: 'commerce', mode: 'order-status', field: 'orderId', targetPath: 'props.content' }],
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 380, {
                id: 'order-confirmation-receipt-section',
                width: 1200,
                height: 430,
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 500, width: 768, height: 720 },
                    mobile: { y: 610, width: 375, height: 760 },
                },
                children: [
                    createCanvasElement('box', 72, 62, {
                        id: 'order-confirmation-receipt-card',
                        width: 520,
                        height: 300,
                        dataBindings: [{ source: 'commerce', mode: 'order-receipt', fields: ['customerEmail', 'lineItems', 'subtotal', 'shipping', 'tax', 'total'] }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 300 },
                            mobile: { x: 24, y: 46, width: 327, height: 318 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'order-confirmation-receipt-heading',
                                width: 260,
                                height: 34,
                                props: { content: 'Receipt summary', level: 'h2', fontSize: 24, fontWeight: '800', color: '#111827' },
                            }),
                            ...['Digital kit', 'Service package', 'Estimated tax'].map((item, index) => createCanvasElement('text', 24, 86 + index * 42, {
                                id: `order-confirmation-receipt-line-${index}`,
                                width: 260,
                                height: 24,
                                props: { content: item, fontSize: 15, color: '#475569' },
                            })),
                            ...['$49.00', '$99.00', '$11.44'].map((item, index) => createCanvasElement('text', 390, 86 + index * 42, {
                                id: `order-confirmation-receipt-value-${index}`,
                                width: 82,
                                height: 24,
                                props: { content: item, fontSize: 15, fontWeight: '700', color: '#111827', textAlign: 'right' },
                                responsive: {
                                    tablet: { x: 540, width: 80 },
                                    mobile: { x: 214, width: 70 },
                                },
                            })),
                            createCanvasElement('text', 24, 226, {
                                id: 'order-confirmation-total-label',
                                width: 120,
                                height: 28,
                                props: { content: 'Total paid', fontSize: 18, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('text', 374, 226, {
                                id: 'order-confirmation-total-value',
                                width: 98,
                                height: 28,
                                props: { content: '$159.44', fontSize: 18, fontWeight: '800', color: '#15803d', textAlign: 'right' },
                                dataBindings: [{ source: 'commerce', mode: 'order-receipt', field: 'total', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { x: 526, width: 94 },
                                    mobile: { x: 196, width: 98 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 664, 62, {
                        id: 'order-confirmation-delivery-card',
                        width: 400,
                        height: 300,
                        dataBindings: [{ source: 'commerce', mode: 'fulfillment', fields: ['fulfillmentStatus', 'trackingNumber', 'estimatedDelivery'] }],
                        props: { backgroundColor: '#111827', borderRadius: 8, color: '#ffffff', padding: 0 },
                        responsive: {
                            tablet: { x: 54, y: 400, width: 660, height: 250 },
                            mobile: { x: 24, y: 410, width: 327, height: 286 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'order-confirmation-delivery-heading',
                                width: 280,
                                height: 34,
                                props: { content: 'What happens next', level: 'h2', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 24, 80, {
                                id: 'order-confirmation-delivery-copy',
                                width: 310,
                                height: 80,
                                props: { content: 'Fulfillment, tracking, and support updates can bind to the private order record while this page only shows customer-safe receipt details.', fontSize: 15, lineHeight: 1.5, color: '#d1d5db' },
                                responsive: {
                                    tablet: { width: 520, height: 68 },
                                    mobile: { width: 270, height: 112 },
                                },
                            }),
                            createCanvasElement('text', 24, 186, {
                                id: 'order-confirmation-tracking-status',
                                width: 230,
                                height: 26,
                                props: { content: 'Preparing fulfillment', fontSize: 16, fontWeight: '800', color: '#bbf7d0' },
                                dataBindings: [{ source: 'commerce', mode: 'fulfillment', field: 'fulfillmentStatus', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { y: 178, width: 300 },
                                    mobile: { y: 220, width: 260 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 810, {
                id: 'order-confirmation-next-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'commerce', mode: 'post-purchase-actions', fields: ['accountUrl', 'supportUrl', 'continueShoppingUrl'] }],
                props: { backgroundColor: '#f9fafb', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1220, width: 768, height: 620 },
                    mobile: { y: 1370, width: 375, height: 720 },
                },
                children: [
                    createCanvasElement('heading', 72, 54, {
                        id: 'order-confirmation-next-heading',
                        width: 380,
                        height: 44,
                        props: { content: 'Next steps', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 380 },
                            mobile: { x: 24, y: 46, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Create an account', copy: 'Save receipt history and update profile details.', button: 'Account', href: '/account' },
                        { title: 'Keep shopping', copy: 'Return to products, subscriptions, or digital downloads.', button: 'Shop', href: '/store' },
                        { title: 'Need help?', copy: 'Send customers to support with the order id attached.', button: 'Support', href: '/contact' },
                    ].map((item, index) => createCanvasElement('box', 72 + index * 360, 126, {
                        id: `order-confirmation-next-card-${index}`,
                        width: 318,
                        height: 128,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 126 + index * 150, width: 660, height: 128 },
                            mobile: { x: 24, y: 114 + index * 176, width: 327, height: 154 },
                        },
                        children: [
                            createCanvasElement('heading', 20, 18, {
                                id: `order-confirmation-next-title-${index}`,
                                width: 210,
                                height: 28,
                                props: { content: item.title, level: 'h3', fontSize: 19, fontWeight: '750', color: '#111827' },
                                responsive: {
                                    tablet: { width: 340 },
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 20, 54, {
                                id: `order-confirmation-next-copy-${index}`,
                                width: 190,
                                height: 48,
                                props: { content: item.copy, fontSize: 13, lineHeight: 1.4, color: '#64748b' },
                                responsive: {
                                    tablet: { width: 380 },
                                    mobile: { width: 260, height: 44 },
                                },
                            }),
                            createCanvasElement('button', 222, 48, {
                                id: `order-confirmation-next-button-${index}`,
                                width: 72,
                                height: 38,
                                props: { label: item.button, href: item.href, backgroundColor: '#dcfce7', color: '#166534', borderRadius: 8, fontSize: 13, fontWeight: '800' },
                                responsive: {
                                    tablet: { x: 548, y: 44, width: 86, height: 40 },
                                    mobile: { x: 20, y: 102, width: 100, height: 40 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
        ]);
    }

    if (input.template === 'help-center') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'help-center-hero-section',
                width: 1200,
                height: 360,
                dataBindings: [{ source: 'support', mode: 'help-center', fields: ['query', 'popularArticles', 'categories'] }],
                props: { backgroundColor: '#eff6ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 520 },
                    mobile: { width: 375, height: 650 },
                },
                children: [
                    createCanvasElement('text', 76, 64, {
                        id: 'help-center-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Support center', fontSize: 13, fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 104, {
                        id: 'help-center-heading',
                        width: 640,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#0f172a' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 520, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 142, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 220, {
                        id: 'help-center-copy',
                        width: 600,
                        height: 64,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#334155' },
                        responsive: {
                            tablet: { x: 56, y: 204, width: 520, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 246, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('input', 720, 126, {
                        id: 'help-center-search-input',
                        width: 340,
                        height: 58,
                        props: { label: 'Search help', name: 'support_search', placeholder: 'Search orders, accounts, products, or billing' },
                        responsive: {
                            tablet: { x: 54, y: 330, width: 460, height: 58 },
                            mobile: { x: 24, y: 398, width: 327, height: 58 },
                        },
                    }),
                    createCanvasElement('button', 720, 210, {
                        id: 'help-center-search-button',
                        width: 150,
                        height: 48,
                        props: { label: 'Search', backgroundColor: '#1d4ed8', color: '#ffffff', borderRadius: 8, fontSize: 15, fontWeight: '800', action: 'support.search' },
                        responsive: {
                            tablet: { x: 536, y: 336, width: 150, height: 48 },
                            mobile: { x: 24, y: 484, width: 327, height: 52 },
                        },
                    }),
                ],
            }),
            createCanvasElement('section', 0, 360, {
                id: 'help-center-category-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'support', mode: 'categories', limit: 6 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 520, width: 768, height: 620 },
                    mobile: { y: 650, width: 375, height: 670 },
                },
                children: [
                    createCanvasElement('heading', 72, 48, {
                        id: 'help-center-category-heading',
                        width: 380,
                        height: 42,
                        props: { content: 'Browse by topic', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 50, width: 420 },
                            mobile: { x: 24, y: 42, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...[
                        { title: 'Orders and checkout', copy: 'Payments, receipts, refunds, and fulfillment status.' },
                        { title: 'Accounts and access', copy: 'Member login, profiles, preferences, and permissions.' },
                        { title: 'Products and media', copy: 'Catalogs, files, downloads, and content updates.' },
                    ].map((item, index) => createCanvasElement('box', 72 + index * 360, 122, {
                        id: `help-center-category-card-${index}`,
                        width: 318,
                        height: 140,
                        dataBindings: [{ source: 'support', mode: 'category', index }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#dbeafe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 120 + index * 154, width: 660, height: 130 },
                            mobile: { x: 24, y: 112 + index * 166, width: 327, height: 144 },
                        },
                        children: [
                            createCanvasElement('heading', 20, 20, {
                                id: `help-center-category-title-${index}`,
                                width: 230,
                                height: 30,
                                props: { content: item.title, level: 'h3', fontSize: 20, fontWeight: '750', color: '#111827' },
                                responsive: {
                                    tablet: { width: 320 },
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 20, 62, {
                                id: `help-center-category-copy-${index}`,
                                width: 240,
                                height: 50,
                                props: { content: item.copy, fontSize: 14, lineHeight: 1.45, color: '#475569' },
                                responsive: {
                                    tablet: { width: 420, height: 42 },
                                    mobile: { width: 260, height: 56 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 690, {
                id: 'help-center-faq-section',
                width: 1200,
                height: 430,
                dataBindings: [{ source: 'support', mode: 'faq', limit: 8 }],
                props: { backgroundColor: '#f9fafb', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1140, width: 768, height: 780 },
                    mobile: { y: 1320, width: 375, height: 870 },
                },
                children: [
                    createCanvasElement('heading', 72, 54, {
                        id: 'help-center-faq-heading',
                        width: 420,
                        height: 42,
                        props: { content: 'Frequently asked questions', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 480 },
                            mobile: { x: 24, y: 46, width: 320, height: 70, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('box', 72, 124, {
                        id: 'help-center-faq-list',
                        width: 690,
                        height: 250,
                        dataBindings: [{ source: 'support', mode: 'faq-list', limit: 5 }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 124, width: 660, height: 250 },
                            mobile: { x: 24, y: 140, width: 327, height: 318 },
                        },
                        children: [
                            'How do I track my order?',
                            'How do I update my account email?',
                            'Where do digital downloads appear?',
                        ].map((item, index) => createCanvasElement('box', 20, 20 + index * 72, {
                            id: `help-center-faq-item-${index}`,
                            width: 650,
                            height: 60,
                            dataBindings: [{ source: 'support', mode: 'faq-item', index }],
                            props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                            responsive: {
                                tablet: { width: 620 },
                                mobile: { x: 18, y: 18 + index * 96, width: 291, height: 84 },
                            },
                            children: [
                                createCanvasElement('text', 18, 18, {
                                    id: `help-center-faq-question-${index}`,
                                    width: 450,
                                    height: 24,
                                    props: { content: item, fontSize: 15, fontWeight: '800', color: '#111827' },
                                    dataBindings: [{ source: 'support', mode: 'faq-item', index, field: 'question', targetPath: 'props.content' }],
                                    responsive: {
                                        tablet: { width: 500 },
                                        mobile: { width: 226, height: 42 },
                                    },
                                }),
                                createCanvasElement('text', 588, 18, {
                                    id: `help-center-faq-toggle-${index}`,
                                    width: 22,
                                    height: 24,
                                    props: { content: '+', fontSize: 20, fontWeight: '800', color: '#2563eb', textAlign: 'center' },
                                    responsive: {
                                        tablet: { x: 558 },
                                        mobile: { x: 250, y: 20, width: 24 },
                                    },
                                }),
                            ],
                        })),
                    }),
                    createCanvasElement('box', 820, 124, {
                        id: 'help-center-escalation-card',
                        width: 300,
                        height: 250,
                        props: { backgroundColor: '#111827', borderRadius: 8, color: '#ffffff', padding: 0 },
                        responsive: {
                            tablet: { x: 54, y: 430, width: 660, height: 250 },
                            mobile: { x: 24, y: 514, width: 327, height: 280 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'help-center-escalation-heading',
                                width: 220,
                                height: 34,
                                props: { content: 'Still need help?', level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: 'help-center-escalation-copy',
                                width: 230,
                                height: 72,
                                props: { content: 'Route visitors to a contact page, support inbox, or authenticated account page with context from their current order.', fontSize: 14, lineHeight: 1.5, color: '#d1d5db' },
                                responsive: {
                                    tablet: { width: 500, height: 64 },
                                    mobile: { width: 270, height: 96 },
                                },
                            }),
                            createCanvasElement('button', 24, 176, {
                                id: 'help-center-contact-button',
                                width: 150,
                                height: 46,
                                props: { label: 'Contact support', href: '/contact', backgroundColor: '#dbeafe', color: '#1e3a8a', borderRadius: 8, fontSize: 14, fontWeight: '800' },
                                responsive: {
                                    tablet: { y: 176, width: 170 },
                                    mobile: { y: 206, width: 180, height: 48 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'faq') {
        const questions = [
            { question: 'How do I update page content?', answer: 'Open the editor, select the page section, edit the content, and publish when ready.' },
            { question: 'Can I connect this page to my frontend?', answer: 'Use the public Backy API, manifest, or SDK payloads to hydrate answers in your custom site.' },
            { question: 'Where do support requests go?', answer: 'Route visitors to a Backy form, help center, account area, or external support inbox.' },
        ];

        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'faq-hero-section',
                width: 1200,
                height: 340,
                dataBindings: [{ source: 'faq', mode: 'overview', fields: ['questions', 'categories', 'searchUrl', 'contactUrl'] }],
                props: { backgroundColor: '#eff6ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 500 },
                    mobile: { width: 375, height: 620 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'faq-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Questions', fontSize: 13, fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 98, {
                        id: 'faq-heading',
                        width: 620,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#0f172a' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 520, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 212, {
                        id: 'faq-intro-copy',
                        width: 610,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#334155' },
                        responsive: {
                            tablet: { x: 56, y: 204, width: 520, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('input', 752, 118, {
                        id: 'faq-search-input',
                        width: 330,
                        height: 58,
                        dataBindings: [{ source: 'faq', mode: 'search', fields: ['query', 'categories'] }],
                        props: { label: 'Search FAQ', name: 'faq_search', placeholder: 'Search questions or topics' },
                        responsive: {
                            tablet: { x: 54, y: 330, width: 460, height: 58 },
                            mobile: { x: 24, y: 388, width: 327, height: 58 },
                        },
                    }),
                    createCanvasElement('button', 752, 202, {
                        id: 'faq-search-button',
                        width: 142,
                        height: 48,
                        props: { label: 'Search', backgroundColor: '#1d4ed8', color: '#ffffff', borderRadius: 8, fontSize: 15, fontWeight: '800', action: 'faq.search' },
                        responsive: {
                            tablet: { x: 536, y: 336, width: 142, height: 48 },
                            mobile: { x: 24, y: 474, width: 327, height: 52 },
                        },
                    }),
                ],
            }),
            createCanvasElement('section', 0, 340, {
                id: 'faq-question-section',
                width: 1200,
                height: 470,
                dataBindings: [{ source: 'faq', mode: 'questions', fields: ['questions', 'categories', 'answers'], limit: 10 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 500, width: 768, height: 860 },
                    mobile: { y: 620, width: 375, height: 1110 },
                },
                children: [
                    createCanvasElement('box', 74, 60, {
                        id: 'faq-category-filter',
                        width: 270,
                        height: 300,
                        dataBindings: [{ source: 'faq', mode: 'categories', fields: ['name', 'slug', 'questionCount'] }],
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#dbeafe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 150 },
                            mobile: { x: 24, y: 46, width: 327, height: 254 },
                        },
                        children: [
                            createCanvasElement('heading', 22, 24, {
                                id: 'faq-category-heading',
                                width: 190,
                                height: 28,
                                props: { content: 'Categories', level: 'h2', fontSize: 22, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    tablet: { width: 240 },
                                    mobile: { width: 220 },
                                },
                            }),
                            ...['Account', 'Orders', 'Content', 'Billing'].map((item, index) => createCanvasElement('button', 22, 74 + index * 48, {
                                id: `faq-category-chip-${index}`,
                                width: 180,
                                height: 34,
                                props: { label: item, backgroundColor: index === 0 ? '#1d4ed8' : '#ffffff', color: index === 0 ? '#ffffff' : '#1e3a8a', borderRadius: 8, fontSize: 13, fontWeight: '800', action: 'faq.filter.category' },
                                dataBindings: [{ source: 'faq', mode: 'category', index, field: 'name', targetPath: 'props.label' }],
                                responsive: {
                                    tablet: { x: 22 + (index % 4) * 150, y: 78, width: 132, height: 40 },
                                    mobile: { x: 22, y: 72 + index * 42, width: 180, height: 36 },
                                },
                            })),
                        ],
                    }),
                    createCanvasElement('box', 390, 60, {
                        id: 'faq-question-list',
                        width: 690,
                        height: 300,
                        dataBindings: [{ source: 'faq', mode: 'question-list', limit: 8 }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 250, width: 660, height: 500 },
                            mobile: { x: 24, y: 350, width: 327, height: 620 },
                        },
                        children: questions.map((item, index) => createCanvasElement('box', 20, 20 + index * 88, {
                            id: `faq-question-item-${index}`,
                            width: 650,
                            height: 74,
                            dataBindings: [{ source: 'faq', mode: 'question', index }],
                            props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                            responsive: {
                                tablet: { width: 620, height: 118, y: 20 + index * 146 },
                                mobile: { x: 18, y: 18 + index * 190, width: 291, height: 174 },
                            },
                            children: [
                                createCanvasElement('text', 18, 14, {
                                    id: `faq-question-title-${index}`,
                                    width: 500,
                                    height: 24,
                                    props: { content: item.question, fontSize: 15, fontWeight: '800', color: '#111827' },
                                    dataBindings: [{ source: 'faq', mode: 'question', index, field: 'question', targetPath: 'props.content' }],
                                    responsive: {
                                        tablet: { width: 500, height: 24 },
                                        mobile: { width: 226, height: 46 },
                                    },
                                }),
                                createCanvasElement('paragraph', 18, 42, {
                                    id: `faq-question-answer-${index}`,
                                    width: 540,
                                    height: 22,
                                    props: { content: item.answer, fontSize: 13, lineHeight: 1.35, color: '#64748b' },
                                    dataBindings: [{ source: 'faq', mode: 'question', index, field: 'answer', targetPath: 'props.content' }],
                                    responsive: {
                                        tablet: { y: 48, width: 500, height: 44 },
                                        mobile: { y: 72, width: 226, height: 68 },
                                    },
                                }),
                                createCanvasElement('button', 590, 18, {
                                    id: `faq-question-toggle-${index}`,
                                    width: 36,
                                    height: 36,
                                    props: { label: '+', backgroundColor: '#dbeafe', color: '#1e3a8a', borderRadius: 8, fontSize: 18, fontWeight: '800', action: 'faq.toggle' },
                                    responsive: {
                                        tablet: { x: 558, y: 18, width: 40, height: 40 },
                                        mobile: { x: 236, y: 18, width: 40, height: 40 },
                                    },
                                }),
                            ],
                        })),
                    }),
                ],
            }),
            createCanvasElement('section', 0, 810, {
                id: 'faq-support-section',
                width: 1200,
                height: 260,
                dataBindings: [{ source: 'faq', mode: 'support', fields: ['contactUrl', 'helpCenterUrl', 'supportEmail'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1360, width: 768, height: 460 },
                    mobile: { y: 1730, width: 375, height: 560 },
                },
                children: [
                    createCanvasElement('box', 74, 58, {
                        id: 'faq-support-card',
                        width: 520,
                        height: 150,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 150 },
                            mobile: { x: 24, y: 46, width: 327, height: 204 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 26, {
                                id: 'faq-support-heading',
                                width: 300,
                                height: 32,
                                props: { content: 'Need a human answer?', level: 'h2', fontSize: 26, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 64, props: { fontSize: 24 } },
                                },
                            }),
                            createCanvasElement('paragraph', 26, 76, {
                                id: 'faq-support-copy',
                                width: 390,
                                height: 44,
                                props: { content: 'Route unanswered questions to your support form, help center, or account workspace with the visitor context attached.', fontSize: 14, lineHeight: 1.45, color: '#475569' },
                                responsive: {
                                    tablet: { width: 500 },
                                    mobile: { y: 104, width: 270, height: 76 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 680, 58, {
                        id: 'faq-contact-card',
                        width: 360,
                        height: 150,
                        dataBindings: [{ source: 'faq', mode: 'contact', fields: ['contactUrl', 'supportEmail'] }],
                        props: { backgroundColor: '#1e3a8a', borderRadius: 8, borderColor: '#1e3a8a', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 250, width: 660, height: 150 },
                            mobile: { x: 24, y: 292, width: 327, height: 190 },
                        },
                        children: [
                            createCanvasElement('text', 26, 24, {
                                id: 'faq-contact-label',
                                width: 230,
                                height: 24,
                                props: { content: 'Still stuck?', fontSize: 15, fontWeight: '800', color: '#dbeafe' },
                            }),
                            createCanvasElement('button', 26, 76, {
                                id: 'faq-contact-button',
                                width: 146,
                                height: 42,
                                props: { label: 'Contact support', backgroundColor: '#ffffff', color: '#1e3a8a', borderRadius: 8, fontSize: 14, fontWeight: '800', action: 'faq.contact.open' },
                                dataBindings: [{ source: 'faq', mode: 'contact', field: 'contactUrl', targetPath: 'props.href' }],
                                responsive: {
                                    tablet: { width: 170, height: 44 },
                                    mobile: { width: 180, height: 48 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'testimonials') {
        const reviews = [
            { name: 'Harper Lee', role: 'Studio owner', quote: 'Backy gave us a clean way to update launches, products, and landing pages without rebuilding the frontend.', rating: '5.0' },
            { name: 'Jon Bell', role: 'Commerce lead', quote: 'Our team can manage catalog content, support pages, and campaign proof from one backend workspace.', rating: '4.9' },
            { name: 'Nia Wells', role: 'Founder', quote: 'The editor keeps our custom site flexible while still giving non-technical teammates safe control.', rating: '5.0' },
        ];

        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'testimonials-hero-section',
                width: 1200,
                height: 360,
                dataBindings: [{ source: 'testimonials', mode: 'overview', fields: ['reviews', 'averageRating', 'featuredLogo', 'inquiryUrl'] }],
                props: { backgroundColor: '#fffbeb', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 500 },
                    mobile: { width: 375, height: 610 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'testimonials-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Customer proof', fontSize: 13, fontWeight: '800', color: '#b45309', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 98, {
                        id: 'testimonials-heading',
                        width: 640,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 520, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 212, {
                        id: 'testimonials-intro-copy',
                        width: 620,
                        height: 70,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#374151' },
                        responsive: {
                            tablet: { x: 56, y: 204, width: 520, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 784, 92, {
                        id: 'testimonials-rating-card',
                        width: 300,
                        height: 150,
                        dataBindings: [{ source: 'testimonials', mode: 'rating-summary', fields: ['averageRating', 'reviewCount', 'sources'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#fde68a', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 330, width: 330, height: 130 },
                            mobile: { x: 24, y: 390, width: 327, height: 150 },
                        },
                        children: [
                            createCanvasElement('text', 26, 24, {
                                id: 'testimonials-rating-label',
                                width: 180,
                                height: 24,
                                props: { content: 'Average rating', fontSize: 13, fontWeight: '800', color: '#92400e', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 26, 58, {
                                id: 'testimonials-rating-value',
                                width: 120,
                                height: 54,
                                props: { content: '4.9 / 5', level: 'h2', fontSize: 38, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'testimonials', mode: 'rating-summary', field: 'averageRating', targetPath: 'props.content' }],
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 360, {
                id: 'testimonials-review-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'testimonials', mode: 'reviews', fields: ['reviews', 'ratings', 'industries', 'sources'], limit: 9 }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 500, width: 768, height: 1080 },
                    mobile: { y: 610, width: 375, height: 1240 },
                },
                children: [
                    createCanvasElement('heading', 74, 58, {
                        id: 'testimonials-review-heading',
                        width: 420,
                        height: 42,
                        props: { content: 'What customers say', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 420 },
                            mobile: { x: 24, y: 46, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    createCanvasElement('box', 780, 54, {
                        id: 'testimonials-source-filter',
                        width: 300,
                        height: 56,
                        dataBindings: [{ source: 'testimonials', mode: 'filters', fields: ['sources', 'industries', 'ratings'] }],
                        props: { backgroundColor: '#fffbeb', borderRadius: 8, borderColor: '#fde68a', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 124, width: 420, height: 56 },
                            mobile: { x: 24, y: 114, width: 327, height: 64 },
                        },
                        children: [
                            createCanvasElement('text', 20, 17, {
                                id: 'testimonials-source-filter-label',
                                width: 240,
                                height: 24,
                                props: { content: 'Filter by source, industry, or rating', fontSize: 13, fontWeight: '800', color: '#92400e' },
                                responsive: {
                                    mobile: { width: 260, height: 36 },
                                },
                            }),
                        ],
                    }),
                    ...reviews.map((review, index) => createCanvasElement('box', 74 + index * 350, 146, {
                        id: `testimonials-review-card-${index}`,
                        width: 300,
                        height: 300,
                        dataBindings: [{ source: 'testimonials', mode: 'review', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#fde68a', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 220 + index * 270, width: 660, height: 240 },
                            mobile: { x: 24, y: 224 + index * 318, width: 327, height: 300 },
                        },
                        children: [
                            createCanvasElement('text', 24, 24, {
                                id: `testimonials-review-rating-${index}`,
                                width: 84,
                                height: 24,
                                props: { content: review.rating, fontSize: 15, fontWeight: '800', color: '#b45309' },
                                dataBindings: [{ source: 'testimonials', mode: 'review', index, field: 'rating', targetPath: 'props.content' }],
                            }),
                            createCanvasElement('paragraph', 24, 66, {
                                id: `testimonials-review-quote-${index}`,
                                width: 238,
                                height: 104,
                                props: { content: review.quote, fontSize: 15, lineHeight: 1.5, color: '#374151' },
                                dataBindings: [{ source: 'testimonials', mode: 'review', index, field: 'quote', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 520, height: 72 },
                                    mobile: { width: 270, height: 126 },
                                },
                            }),
                            createCanvasElement('heading', 24, 200, {
                                id: `testimonials-review-name-${index}`,
                                width: 220,
                                height: 28,
                                props: { content: review.name, level: 'h3', fontSize: 19, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'testimonials', mode: 'review', index, field: 'name', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { y: 164, width: 300 },
                                    mobile: { y: 210, width: 240 },
                                },
                            }),
                            createCanvasElement('text', 24, 238, {
                                id: `testimonials-review-role-${index}`,
                                width: 220,
                                height: 24,
                                props: { content: review.role, fontSize: 13, fontWeight: '700', color: '#92400e' },
                                dataBindings: [{ source: 'testimonials', mode: 'review', index, field: 'role', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { y: 198, width: 300 },
                                    mobile: { y: 248, width: 240 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 920, {
                id: 'testimonials-cta-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'testimonials', mode: 'trust-actions', fields: ['caseStudyUrl', 'inquiryUrl', 'logoWall', 'reviewSources'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 460 },
                    mobile: { y: 1850, width: 375, height: 560 },
                },
                children: [
                    createCanvasElement('box', 74, 64, {
                        id: 'testimonials-logo-wall',
                        width: 470,
                        height: 150,
                        dataBindings: [{ source: 'testimonials', mode: 'logo-wall', fields: ['logos', 'industries'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 150 },
                            mobile: { x: 24, y: 46, width: 327, height: 204 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 24, {
                                id: 'testimonials-logo-heading',
                                width: 270,
                                height: 32,
                                props: { content: 'Trusted by growing teams', level: 'h2', fontSize: 26, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 64, props: { fontSize: 24 } },
                                },
                            }),
                            createCanvasElement('paragraph', 26, 78, {
                                id: 'testimonials-logo-copy',
                                width: 360,
                                height: 42,
                                props: { content: 'Bind customer logos, industries, source badges, or review-platform snippets from Backy data.', fontSize: 14, lineHeight: 1.45, color: '#475569' },
                                responsive: {
                                    tablet: { width: 500 },
                                    mobile: { y: 104, width: 270, height: 76 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 650, 64, {
                        id: 'testimonials-inquiry-card',
                        width: 390,
                        height: 150,
                        dataBindings: [{ source: 'testimonials', mode: 'inquiry', fields: ['inquiryUrl', 'caseStudyUrl', 'contactEmail'] }],
                        props: { backgroundColor: '#78350f', borderRadius: 8, borderColor: '#78350f', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 250, width: 660, height: 150 },
                            mobile: { x: 24, y: 292, width: 327, height: 190 },
                        },
                        children: [
                            createCanvasElement('heading', 26, 22, {
                                id: 'testimonials-inquiry-heading',
                                width: 250,
                                height: 32,
                                props: { content: 'Want results like these?', level: 'h2', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                                responsive: {
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('button', 26, 82, {
                                id: 'testimonials-inquiry-button',
                                width: 142,
                                height: 42,
                                props: { label: 'Start inquiry', backgroundColor: '#ffffff', color: '#78350f', borderRadius: 8, fontSize: 14, fontWeight: '800', action: 'testimonials.inquiry.open' },
                                dataBindings: [{ source: 'testimonials', mode: 'inquiry', field: 'inquiryUrl', targetPath: 'props.href' }],
                                responsive: {
                                    tablet: { width: 160, height: 44 },
                                    mobile: { y: 106, width: 170, height: 48 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'blog-index') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'blog-index-hero-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'blog', mode: 'latest', limit: 1 }],
                props: { backgroundColor: '#111827', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 560 },
                },
                children: [
                    createCanvasElement('text', 74, 62, {
                        id: 'blog-index-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Publication', fontSize: 13, fontWeight: '800', color: '#7dd3fc', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 98, {
                        id: 'blog-index-heading',
                        width: 640,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 50, fontWeight: '800', lineHeight: 1.08, color: '#ffffff' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 520, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'blog-index-copy',
                        width: 560,
                        height: 72,
                        props: { content: description, fontSize: 17, lineHeight: 1.55, color: '#d1d5db' },
                        responsive: {
                            tablet: { x: 56, y: 204, width: 500, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 790, 70, {
                        id: 'blog-index-featured-card',
                        width: 300,
                        height: 190,
                        dataBindings: [{ source: 'blog', mode: 'featured', fields: ['title', 'excerpt', 'slug', 'publishedAt'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#374151', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 310, width: 360, height: 130 },
                            mobile: { x: 24, y: 390, width: 327, height: 140 },
                        },
                        children: [
                            createCanvasElement('text', 22, 24, {
                                id: 'blog-index-featured-label',
                                width: 160,
                                height: 22,
                                props: { content: 'Featured story', fontSize: 12, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 22, 58, {
                                id: 'blog-index-featured-title',
                                width: 240,
                                height: 54,
                                props: { content: 'Latest article title', level: 'h3', fontSize: 21, fontWeight: '750', color: '#111827' },
                                responsive: {
                                    tablet: { width: 300, height: 36 },
                                    mobile: { width: 270, height: 38 },
                                },
                            }),
                            createCanvasElement('paragraph', 22, 122, {
                                id: 'blog-index-featured-copy',
                                width: 230,
                                height: 44,
                                props: { content: 'Bind this to the latest or selected Backy blog post.', fontSize: 13, lineHeight: 1.45, color: '#4b5563' },
                                responsive: {
                                    tablet: { y: 102, width: 300, height: 28 },
                                    mobile: { y: 104, width: 270, height: 36 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 330, {
                id: 'blog-index-list-section',
                width: 1200,
                height: 420,
                dataBindings: [{ source: 'blog', mode: 'list', limit: 8, sort: 'publishedAt:desc' }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 560 },
                    mobile: { y: 560, width: 375, height: 660 },
                },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'blog-index-list-heading',
                        width: 420,
                        height: 46,
                        props: { content: 'Latest articles', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 420 },
                            mobile: { x: 24, y: 46, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...['Design notes', 'Product update', 'Field guide'].map((item, index) => createCanvasElement('box', 74, 130 + index * 86, {
                        id: `blog-index-post-row-${index}`,
                        width: 860,
                        height: 68,
                        dataBindings: [{ source: 'blog', mode: 'item', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 126 + index * 118, width: 660, height: 92 },
                            mobile: { x: 24, y: 120 + index * 158, width: 327, height: 132 },
                        },
                        children: [
                            createCanvasElement('heading', 20, 14, {
                                id: `blog-index-post-title-${index}`,
                                width: 320,
                                height: 30,
                                props: { content: item, level: 'h3', fontSize: 20, fontWeight: '750', color: '#111827' },
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 54 },
                                },
                            }),
                            createCanvasElement('text', 650, 20, {
                                id: `blog-index-post-meta-${index}`,
                                width: 150,
                                height: 24,
                                props: { content: '5 min read', fontSize: 13, color: '#6b7280' },
                                responsive: {
                                    tablet: { x: 500, width: 110 },
                                    mobile: { x: 20, y: 88, width: 120 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
        ]);
    }

    if (input.template === 'blog-post') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'blog-post-hero-section',
                width: 1200,
                height: 420,
                dataBindings: [{ source: 'blog', mode: 'post', fields: ['title', 'excerpt', 'slug', 'author', 'publishedAt', 'readingTime', 'featuredImage'] }],
                props: { backgroundColor: '#eef2ff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 760 },
                    mobile: { width: 375, height: 880 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'blog-post-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Article', fontSize: 13, fontWeight: '800', color: '#4338ca', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 96, {
                        id: 'blog-post-heading',
                        width: 660,
                        height: 118,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        dataBindings: [{ source: 'blog', mode: 'post', field: 'title', targetPath: 'props.content' }],
                        responsive: {
                            tablet: { x: 54, y: 92, width: 560, height: 126, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 176, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 232, {
                        id: 'blog-post-excerpt',
                        width: 620,
                        height: 76,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#374151' },
                        dataBindings: [{ source: 'blog', mode: 'post', field: 'excerpt', targetPath: 'props.content' }],
                        responsive: {
                            tablet: { x: 56, y: 240, width: 540, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 286, width: 323, height: 126, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 76, 326, {
                        id: 'blog-post-meta-row',
                        width: 520,
                        height: 44,
                        dataBindings: [{ source: 'blog', mode: 'post-meta', fields: ['author', 'publishedAt', 'readingTime'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#c7d2fe', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 360, width: 520, height: 44 },
                            mobile: { x: 24, y: 438, width: 327, height: 124 },
                        },
                        children: [
                            createCanvasElement('text', 18, 12, {
                                id: 'blog-post-author-name',
                                width: 190,
                                height: 22,
                                props: { content: 'By Editorial team', fontSize: 14, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'blog', mode: 'post', field: 'author.name', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { x: 18, y: 16, width: 240 },
                                },
                            }),
                            createCanvasElement('text', 236, 12, {
                                id: 'blog-post-published-at',
                                width: 120,
                                height: 22,
                                props: { content: 'Published today', fontSize: 14, color: '#4b5563' },
                                dataBindings: [{ source: 'blog', mode: 'post', field: 'publishedAt', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { x: 18, y: 50, width: 240 },
                                },
                            }),
                            createCanvasElement('text', 380, 12, {
                                id: 'blog-post-reading-time',
                                width: 100,
                                height: 22,
                                props: { content: '6 min read', fontSize: 14, color: '#4b5563' },
                                dataBindings: [{ source: 'blog', mode: 'post', field: 'readingTime', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { x: 18, y: 84, width: 240 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 790, 74, {
                        id: 'blog-post-featured-media',
                        width: 330,
                        height: 240,
                        dataBindings: [{ source: 'blog', mode: 'post', field: 'featuredImage', targetPath: 'props.media' }],
                        props: { backgroundColor: '#c7d2fe', borderRadius: 8, borderColor: '#a5b4fc', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 450, width: 660, height: 250 },
                            mobile: { x: 24, y: 610, width: 327, height: 210 },
                        },
                        children: [
                            createCanvasElement('text', 38, 104, {
                                id: 'blog-post-featured-media-label',
                                width: 230,
                                height: 28,
                                props: { content: 'Featured media', fontSize: 16, fontWeight: '800', color: '#3730a3', textAlign: 'center' },
                                responsive: {
                                    tablet: { x: 214, y: 112 },
                                    mobile: { x: 48, y: 92 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 420, {
                id: 'blog-post-body-section',
                width: 1200,
                height: 540,
                dataBindings: [{ source: 'blog', mode: 'post-body', fields: ['content', 'blocks', 'taxonomy', 'author'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 760, width: 768, height: 1140 },
                    mobile: { y: 880, width: 375, height: 1400 },
                },
                children: [
                    createCanvasElement('box', 76, 62, {
                        id: 'blog-post-body-card',
                        width: 680,
                        height: 390,
                        dataBindings: [{ source: 'blog', mode: 'post-body', field: 'content', targetPath: 'props.content' }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 500 },
                            mobile: { x: 24, y: 46, width: 327, height: 640 },
                        },
                        children: [
                            createCanvasElement('heading', 34, 30, {
                                id: 'blog-post-body-heading',
                                width: 420,
                                height: 40,
                                props: { content: 'Article section heading', level: 'h2', fontSize: 30, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    tablet: { width: 520 },
                                    mobile: { x: 24, y: 26, width: 270, height: 78, props: { fontSize: 26 } },
                                },
                            }),
                            createCanvasElement('paragraph', 34, 88, {
                                id: 'blog-post-body-copy-0',
                                width: 580,
                                height: 86,
                                props: { content: 'Use this body card as the editable article content area. Bind rich text blocks, media embeds, tables, and callouts from the Backy blog post payload.', fontSize: 17, lineHeight: 1.65, color: '#374151' },
                                responsive: {
                                    tablet: { width: 560, height: 110 },
                                    mobile: { x: 24, y: 122, width: 270, height: 180, props: { fontSize: 16 } },
                                },
                            }),
                            createCanvasElement('box', 34, 198, {
                                id: 'blog-post-callout',
                                width: 570,
                                height: 94,
                                props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid' },
                                responsive: {
                                    tablet: { y: 238, width: 560, height: 110 },
                                    mobile: { x: 24, y: 330, width: 270, height: 140 },
                                },
                                children: [
                                    createCanvasElement('paragraph', 22, 20, {
                                        id: 'blog-post-callout-copy',
                                        width: 500,
                                        height: 46,
                                        props: { content: 'Highlight a quote, product note, newsletter prompt, or reusable editorial callout.', fontSize: 16, lineHeight: 1.45, color: '#334155' },
                                        responsive: {
                                            tablet: { width: 500, height: 56 },
                                            mobile: { width: 220, height: 88 },
                                        },
                                    }),
                                ],
                            }),
                            createCanvasElement('paragraph', 34, 318, {
                                id: 'blog-post-body-copy-1',
                                width: 580,
                                height: 46,
                                props: { content: 'Continue the article with reusable sections or content synced from the blog editor.', fontSize: 17, lineHeight: 1.55, color: '#374151' },
                                responsive: {
                                    tablet: { y: 388, width: 560, height: 56 },
                                    mobile: { x: 24, y: 506, width: 270, height: 86, props: { fontSize: 16 } },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 812, 62, {
                        id: 'blog-post-author-card',
                        width: 300,
                        height: 190,
                        dataBindings: [{ source: 'blog', mode: 'author', fields: ['name', 'bio', 'avatar'] }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 610, width: 660, height: 190 },
                            mobile: { x: 24, y: 740, width: 327, height: 230 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'blog-post-author-heading',
                                width: 200,
                                height: 30,
                                props: { content: 'About the author', level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('text', 24, 68, {
                                id: 'blog-post-author-display',
                                width: 210,
                                height: 24,
                                props: { content: 'Editorial team', fontSize: 15, fontWeight: '800', color: '#4338ca' },
                                dataBindings: [{ source: 'blog', mode: 'author', field: 'name', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 106, {
                                id: 'blog-post-author-bio',
                                width: 232,
                                height: 54,
                                props: { content: 'Bind author bios, avatars, and archive links from Backy editorial profiles.', fontSize: 14, lineHeight: 1.45, color: '#4b5563' },
                                dataBindings: [{ source: 'blog', mode: 'author', field: 'bio', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500 },
                                    mobile: { width: 270, height: 82 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 812, 282, {
                        id: 'blog-post-taxonomy-card',
                        width: 300,
                        height: 170,
                        dataBindings: [{ source: 'blog', mode: 'taxonomy', fields: ['category', 'tags'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 850, width: 660, height: 170 },
                            mobile: { x: 24, y: 1028, width: 327, height: 210 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'blog-post-taxonomy-heading',
                                width: 170,
                                height: 28,
                                props: { content: 'Filed under', level: 'h3', fontSize: 20, fontWeight: '800', color: '#111827' },
                            }),
                            ...['Product', 'Design', 'CMS'].map((tag, index) => createCanvasElement('button', 24 + index * 86, 76, {
                                id: `blog-post-tag-${index}`,
                                width: 74,
                                height: 36,
                                props: { label: tag, backgroundColor: '#eef2ff', color: '#3730a3', borderRadius: 8, fontSize: 13, fontWeight: '800', action: 'blog.filter.tag' },
                                responsive: {
                                    tablet: { width: 90 },
                                    mobile: { x: 24, y: 76 + index * 42, width: 110, height: 36 },
                                },
                            })),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 960, {
                id: 'blog-post-related-section',
                width: 1200,
                height: 300,
                dataBindings: [{ source: 'blog', mode: 'related-posts', limit: 3 }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1900, width: 768, height: 620 },
                    mobile: { y: 2280, width: 375, height: 700 },
                },
                children: [
                    createCanvasElement('heading', 74, 50, {
                        id: 'blog-post-related-heading',
                        width: 360,
                        height: 42,
                        props: { content: 'Related articles', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 360 },
                            mobile: { x: 24, y: 46, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...['Editorial workflow', 'Content models', 'Launch checklist'].map((item, index) => createCanvasElement('box', 74 + index * 330, 126, {
                        id: `blog-post-related-card-${index}`,
                        width: 290,
                        height: 112,
                        dataBindings: [{ source: 'blog', mode: 'related-post', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 126 + index * 140, width: 660, height: 112 },
                            mobile: { x: 24, y: 116 + index * 158, width: 327, height: 136 },
                        },
                        children: [
                            createCanvasElement('heading', 20, 18, {
                                id: `blog-post-related-title-${index}`,
                                width: 220,
                                height: 28,
                                props: { content: item, level: 'h3', fontSize: 18, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'blog', mode: 'related-post', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 420 },
                                    mobile: { width: 260, height: 46 },
                                },
                            }),
                            createCanvasElement('text', 20, 62, {
                                id: `blog-post-related-meta-${index}`,
                                width: 140,
                                height: 22,
                                props: { content: '4 min read', fontSize: 13, color: '#6b7280' },
                                dataBindings: [{ source: 'blog', mode: 'related-post', index, field: 'readingTime', targetPath: 'props.content' }],
                                responsive: {
                                    mobile: { y: 82, width: 140 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
        ]);
    }

    if (input.template === 'team') {
        const profiles = [
            { name: 'Avery Stone', role: 'Founder / Product', bio: 'Owns product direction, customer research, and roadmap decisions across the site experience.' },
            { name: 'Mina Patel', role: 'Design systems', bio: 'Shapes reusable patterns, brand details, and accessible interface behavior for every launch.' },
            { name: 'Noah Kim', role: 'Customer operations', bio: 'Turns customer feedback, support insights, and onboarding questions into clearer workflows.' },
        ];

        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'team-hero-section',
                width: 1200,
                height: 320,
                dataBindings: [{ source: 'team', mode: 'overview', fields: ['people', 'roles', 'departments', 'hiringUrl'] }],
                props: { backgroundColor: '#fdf2f8', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 460 },
                    mobile: { width: 375, height: 590 },
                },
                children: [
                    createCanvasElement('text', 74, 56, {
                        id: 'team-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'People', fontSize: 13, fontWeight: '800', color: '#be185d', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 92, {
                        id: 'team-heading',
                        width: 620,
                        height: 84,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 520, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 132, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 194, {
                        id: 'team-intro-copy',
                        width: 620,
                        height: 76,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#374151' },
                        responsive: {
                            tablet: { x: 56, y: 204, width: 520, height: 78, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 236, width: 323, height: 104, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 800, 88, {
                        id: 'team-role-filter',
                        width: 270,
                        height: 120,
                        dataBindings: [{ source: 'team', mode: 'filters', fields: ['roles', 'departments'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#fbcfe8', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 320, width: 360, height: 110 },
                            mobile: { x: 24, y: 388, width: 327, height: 130 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'team-role-filter-heading',
                                width: 190,
                                height: 28,
                                props: { content: 'Browse by role', level: 'h3', fontSize: 20, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 250 },
                                },
                            }),
                            createCanvasElement('text', 24, 68, {
                                id: 'team-role-filter-copy',
                                width: 210,
                                height: 24,
                                props: { content: 'Leadership / Design / Ops', fontSize: 14, color: '#be185d' },
                                responsive: {
                                    mobile: { width: 250 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 320, {
                id: 'team-roster-section',
                width: 1200,
                height: 560,
                dataBindings: [{ source: 'team', mode: 'roster', fields: ['people', 'roles', 'departments', 'profileImages', 'socialLinks'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 460, width: 768, height: 1120 },
                    mobile: { y: 590, width: 375, height: 1190 },
                },
                children: [
                    createCanvasElement('heading', 74, 58, {
                        id: 'team-roster-heading',
                        width: 380,
                        height: 42,
                        props: { content: 'Team roster', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 380 },
                            mobile: { x: 24, y: 46, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...profiles.map((profile, index) => createCanvasElement('box', 74 + index * 350, 136, {
                        id: `team-profile-card-${index}`,
                        width: 300,
                        height: 330,
                        dataBindings: [{ source: 'team', mode: 'profile', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#f9a8d4', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 126 + index * 310, width: 660, height: 270 },
                            mobile: { x: 24, y: 116 + index * 334, width: 327, height: 310 },
                        },
                        children: [
                            createCanvasElement('box', 24, 24, {
                                id: `team-profile-media-${index}`,
                                width: 88,
                                height: 88,
                                dataBindings: [{ source: 'team', mode: 'profile', index, field: 'image', targetPath: 'props.media' }],
                                props: { backgroundColor: '#fce7f3', borderRadius: 8, borderColor: '#fbcfe8', borderWidth: 1, borderStyle: 'solid' },
                                responsive: {
                                    tablet: { width: 84, height: 84 },
                                    mobile: { width: 84, height: 84 },
                                },
                            }),
                            createCanvasElement('heading', 24, 134, {
                                id: `team-profile-name-${index}`,
                                width: 230,
                                height: 32,
                                props: { content: profile.name, level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'team', mode: 'profile', index, field: 'name', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { x: 132, y: 30, width: 300 },
                                    mobile: { y: 128, width: 260 },
                                },
                            }),
                            createCanvasElement('text', 24, 176, {
                                id: `team-profile-role-${index}`,
                                width: 230,
                                height: 24,
                                props: { content: profile.role, fontSize: 14, fontWeight: '800', color: '#be185d' },
                                dataBindings: [{ source: 'team', mode: 'profile', index, field: 'role', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { x: 132, y: 72, width: 300 },
                                    mobile: { y: 168, width: 260 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 218, {
                                id: `team-profile-bio-${index}`,
                                width: 230,
                                height: 66,
                                props: { content: profile.bio, fontSize: 14, lineHeight: 1.45, color: '#4b5563' },
                                dataBindings: [{ source: 'team', mode: 'profile', index, field: 'bio', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { x: 132, y: 112, width: 420, height: 66 },
                                    mobile: { y: 208, width: 270, height: 58 },
                                },
                            }),
                            createCanvasElement('button', 24, 292, {
                                id: `team-profile-social-${index}`,
                                width: 112,
                                height: 38,
                                props: { label: 'Profile link', backgroundColor: '#fdf2f8', color: '#9d174d', borderRadius: 8, fontSize: 13, fontWeight: '800', action: 'team.profile.open' },
                                dataBindings: [{ source: 'team', mode: 'profile', index, field: 'socialLinks.primary', targetPath: 'props.href' }],
                                responsive: {
                                    tablet: { x: 132, y: 206, width: 126, height: 40 },
                                    mobile: { y: 270, width: 126, height: 40 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 880, {
                id: 'team-culture-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'team', mode: 'culture', fields: ['values', 'hiringUrl', 'contactEmail'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 520 },
                    mobile: { y: 1780, width: 375, height: 600 },
                },
                children: [
                    createCanvasElement('box', 74, 64, {
                        id: 'team-values-card',
                        width: 500,
                        height: 190,
                        dataBindings: [{ source: 'team', mode: 'team-values', fields: ['values', 'operatingPrinciples', 'location'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 190 },
                            mobile: { x: 24, y: 46, width: 327, height: 226 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 28, {
                                id: 'team-values-heading',
                                width: 300,
                                height: 34,
                                props: { content: 'How we work', level: 'h2', fontSize: 28, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 40, props: { fontSize: 24 } },
                                },
                            }),
                            createCanvasElement('paragraph', 28, 82, {
                                id: 'team-values-copy',
                                width: 400,
                                height: 70,
                                props: { content: 'Use this card for operating principles, locations, advisory notes, or the trust markers that help visitors understand the team.', fontSize: 15, lineHeight: 1.55, color: '#475569' },
                                responsive: {
                                    tablet: { width: 520 },
                                    mobile: { y: 92, width: 270, height: 104 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 650, 64, {
                        id: 'team-hiring-card',
                        width: 400,
                        height: 190,
                        dataBindings: [{ source: 'team', mode: 'hiring', fields: ['hiringUrl', 'openRoles', 'contactEmail'] }],
                        props: { backgroundColor: '#831843', borderRadius: 8, borderColor: '#831843', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 292, width: 660, height: 190 },
                            mobile: { x: 24, y: 316, width: 327, height: 220 },
                        },
                        children: [
                            createCanvasElement('heading', 28, 26, {
                                id: 'team-hiring-heading',
                                width: 260,
                                height: 34,
                                props: { content: 'Building with us?', level: 'h2', fontSize: 26, fontWeight: '800', color: '#ffffff' },
                                responsive: {
                                    mobile: { width: 260, height: 40, props: { fontSize: 24 } },
                                },
                            }),
                            createCanvasElement('paragraph', 28, 78, {
                                id: 'team-hiring-copy',
                                width: 310,
                                height: 54,
                                props: { content: 'Bind open roles, partner inquiries, or a recruiting form from your people data.', fontSize: 15, lineHeight: 1.45, color: '#fce7f3' },
                                responsive: {
                                    tablet: { width: 500 },
                                    mobile: { y: 88, width: 270, height: 76 },
                                },
                            }),
                            createCanvasElement('button', 28, 140, {
                                id: 'team-hiring-button',
                                width: 134,
                                height: 40,
                                props: { label: 'Open roles', backgroundColor: '#ffffff', color: '#831843', borderRadius: 8, fontSize: 14, fontWeight: '800', action: 'team.hiring.open' },
                                dataBindings: [{ source: 'team', mode: 'hiring', field: 'hiringUrl', targetPath: 'props.href' }],
                                responsive: {
                                    mobile: { y: 164, width: 140, height: 44 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'careers') {
        const jobs = [
            { title: 'Product designer', meta: 'Design / Remote / Full time', summary: 'Shape reusable editor workflows, site templates, and accessible design systems for creators.' },
            { title: 'Full-stack engineer', meta: 'Engineering / Hybrid / Full time', summary: 'Build APIs, editor infrastructure, and provider integrations that power customer websites.' },
            { title: 'Customer success lead', meta: 'Operations / Remote / Contract', summary: 'Turn onboarding feedback, support themes, and launch needs into better product workflows.' },
        ];

        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'careers-hero-section',
                width: 1200,
                height: 360,
                dataBindings: [{ source: 'careers', mode: 'overview', fields: ['openRoles', 'departments', 'locations', 'applicationUrl'] }],
                props: { backgroundColor: '#ecfdf5', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { width: 768, height: 500 },
                    mobile: { width: 375, height: 630 },
                },
                children: [
                    createCanvasElement('text', 74, 58, {
                        id: 'careers-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Careers', fontSize: 13, fontWeight: '800', color: '#047857', textTransform: 'uppercase' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 220 },
                            mobile: { x: 24, y: 44, width: 220 },
                        },
                    }),
                    createCanvasElement('heading', 72, 98, {
                        id: 'careers-heading',
                        width: 660,
                        height: 92,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 92, width: 520, height: 92, props: { fontSize: 42 } },
                            mobile: { x: 24, y: 82, width: 327, height: 142, props: { fontSize: 34 } },
                        },
                    }),
                    createCanvasElement('paragraph', 76, 212, {
                        id: 'careers-intro-copy',
                        width: 630,
                        height: 78,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#374151' },
                        responsive: {
                            tablet: { x: 56, y: 204, width: 520, height: 86, props: { fontSize: 16 } },
                            mobile: { x: 26, y: 254, width: 323, height: 116, props: { fontSize: 16 } },
                        },
                    }),
                    createCanvasElement('box', 806, 92, {
                        id: 'careers-role-filter',
                        width: 270,
                        height: 138,
                        dataBindings: [{ source: 'careers', mode: 'filters', fields: ['departments', 'locations', 'employmentTypes'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#a7f3d0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 330, width: 380, height: 130 },
                            mobile: { x: 24, y: 420, width: 327, height: 140 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'careers-role-filter-heading',
                                width: 190,
                                height: 28,
                                props: { content: 'Filter roles', level: 'h3', fontSize: 20, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 250 },
                                },
                            }),
                            createCanvasElement('text', 24, 70, {
                                id: 'careers-role-filter-copy',
                                width: 210,
                                height: 24,
                                props: { content: 'Department / Location / Type', fontSize: 14, color: '#047857' },
                                responsive: {
                                    mobile: { width: 250 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 360, {
                id: 'careers-jobs-section',
                width: 1200,
                height: 580,
                dataBindings: [{ source: 'careers', mode: 'jobs', fields: ['openRoles', 'departments', 'locations', 'employmentTypes', 'applicationUrl'] }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 500, width: 768, height: 1080 },
                    mobile: { y: 630, width: 375, height: 1240 },
                },
                children: [
                    createCanvasElement('heading', 74, 58, {
                        id: 'careers-jobs-heading',
                        width: 360,
                        height: 42,
                        props: { content: 'Open roles', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 360 },
                            mobile: { x: 24, y: 46, width: 320, props: { fontSize: 28 } },
                        },
                    }),
                    ...jobs.map((job, index) => createCanvasElement('box', 74 + index * 350, 136, {
                        id: `careers-job-card-${index}`,
                        width: 300,
                        height: 340,
                        dataBindings: [{ source: 'careers', mode: 'job', index }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bbf7d0', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 126 + index * 292, width: 660, height: 250 },
                            mobile: { x: 24, y: 116 + index * 344, width: 327, height: 318 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 28, {
                                id: `careers-job-title-${index}`,
                                width: 230,
                                height: 36,
                                props: { content: job.title, level: 'h3', fontSize: 22, fontWeight: '800', color: '#111827' },
                                dataBindings: [{ source: 'careers', mode: 'job', index, field: 'title', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 360 },
                                    mobile: { width: 260, height: 62 },
                                },
                            }),
                            createCanvasElement('text', 24, 82, {
                                id: `careers-job-meta-${index}`,
                                width: 230,
                                height: 24,
                                props: { content: job.meta, fontSize: 13, fontWeight: '800', color: '#047857' },
                                dataBindings: [{ source: 'careers', mode: 'job', index, field: 'metadata', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 360 },
                                    mobile: { y: 96, width: 260, height: 38 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 128, {
                                id: `careers-job-summary-${index}`,
                                width: 230,
                                height: 92,
                                props: { content: job.summary, fontSize: 14, lineHeight: 1.5, color: '#4b5563' },
                                dataBindings: [{ source: 'careers', mode: 'job', index, field: 'summary', targetPath: 'props.content' }],
                                responsive: {
                                    tablet: { width: 500, height: 64 },
                                    mobile: { y: 156, width: 270, height: 84 },
                                },
                            }),
                            createCanvasElement('button', 24, 270, {
                                id: `careers-job-apply-${index}`,
                                width: 116,
                                height: 40,
                                props: { label: 'Apply', backgroundColor: '#047857', color: '#ffffff', borderRadius: 8, fontSize: 14, fontWeight: '800', action: 'careers.application.open' },
                                dataBindings: [{ source: 'careers', mode: 'job', index, field: 'applicationUrl', targetPath: 'props.href' }],
                                responsive: {
                                    tablet: { y: 186, width: 124, height: 42 },
                                    mobile: { y: 256, width: 124, height: 42 },
                                },
                            }),
                        ],
                    })),
                ],
            }),
            createCanvasElement('section', 0, 940, {
                id: 'careers-culture-section',
                width: 1200,
                height: 340,
                dataBindings: [{ source: 'careers', mode: 'culture', fields: ['benefits', 'hiringProcess', 'contactEmail'] }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 1580, width: 768, height: 820 },
                    mobile: { y: 1870, width: 375, height: 920 },
                },
                children: [
                    createCanvasElement('box', 74, 64, {
                        id: 'careers-benefits-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'careers', mode: 'benefits', fields: ['benefits', 'workModes', 'locations'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 54, width: 660, height: 190 },
                            mobile: { x: 24, y: 46, width: 327, height: 230 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 26, {
                                id: 'careers-benefits-heading',
                                width: 230,
                                height: 32,
                                props: { content: 'Benefits', level: 'h2', fontSize: 26, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 40, props: { fontSize: 24 } },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: 'careers-benefits-copy',
                                width: 250,
                                height: 74,
                                props: { content: 'Bind benefits, compensation notes, work modes, and office or remote expectations from careers settings.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                                responsive: {
                                    tablet: { width: 520 },
                                    mobile: { y: 88, width: 270, height: 104 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 434, 64, {
                        id: 'careers-process-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'careers', mode: 'hiring-process', fields: ['steps', 'timeline', 'contactEmail'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 292, width: 660, height: 190 },
                            mobile: { x: 24, y: 326, width: 327, height: 230 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 26, {
                                id: 'careers-process-heading',
                                width: 240,
                                height: 32,
                                props: { content: 'Hiring process', level: 'h2', fontSize: 26, fontWeight: '800', color: '#111827' },
                                responsive: {
                                    mobile: { width: 260, height: 40, props: { fontSize: 24 } },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 78, {
                                id: 'careers-process-copy',
                                width: 250,
                                height: 74,
                                props: { content: 'Explain application review, interviews, trial work, offer timing, and accessibility accommodations.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                                responsive: {
                                    tablet: { width: 520 },
                                    mobile: { y: 88, width: 270, height: 104 },
                                },
                            }),
                        ],
                    }),
                    createCanvasElement('box', 794, 64, {
                        id: 'careers-apply-card',
                        width: 330,
                        height: 190,
                        dataBindings: [{ source: 'careers', mode: 'application', fields: ['applicationUrl', 'contactEmail', 'talentPoolUrl'] }],
                        props: { backgroundColor: '#064e3b', borderRadius: 8, borderColor: '#064e3b', borderWidth: 1, borderStyle: 'solid' },
                        responsive: {
                            tablet: { x: 54, y: 530, width: 660, height: 210 },
                            mobile: { x: 24, y: 606, width: 327, height: 240 },
                        },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'careers-apply-heading',
                                width: 230,
                                height: 32,
                                props: { content: 'Join the talent pool', level: 'h2', fontSize: 24, fontWeight: '800', color: '#ffffff' },
                                responsive: {
                                    mobile: { width: 260, height: 64 },
                                },
                            }),
                            createCanvasElement('paragraph', 24, 74, {
                                id: 'careers-apply-copy',
                                width: 250,
                                height: 50,
                                props: { content: 'Route candidates to the right application form or external recruiting system.', fontSize: 14, lineHeight: 1.45, color: '#d1fae5' },
                                responsive: {
                                    tablet: { width: 500 },
                                    mobile: { y: 104, width: 270, height: 68 },
                                },
                            }),
                            createCanvasElement('button', 24, 138, {
                                id: 'careers-apply-button',
                                width: 128,
                                height: 40,
                                props: { label: 'Apply now', backgroundColor: '#ffffff', color: '#064e3b', borderRadius: 8, fontSize: 14, fontWeight: '800', action: 'careers.application.open' },
                                dataBindings: [{ source: 'careers', mode: 'application', field: 'applicationUrl', targetPath: 'props.href' }],
                                responsive: {
                                    tablet: { y: 142, width: 140, height: 44 },
                                    mobile: { y: 178, width: 140, height: 44 },
                                },
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'about') {
        return withChrome([
            createCanvasElement('heading', 80, 72, {
                id: 'about-heading',
                width: 640,
                height: 84,
                props: { content: title, level: 'h1', fontSize: 48, fontWeight: '800', color: '#111827' },
                responsive: {
                    tablet: { x: 54, y: 72, width: 560, height: 84, props: { fontSize: 42 } },
                    mobile: { x: 24, y: 64, width: 327, height: 116, props: { fontSize: 34 } },
                },
            }),
            createCanvasElement('paragraph', 82, 178, {
                id: 'about-story-copy',
                width: 720,
                height: 130,
                props: { content: description, fontSize: 18, lineHeight: 1.65, color: '#374151' },
                responsive: {
                    tablet: { x: 56, y: 182, width: 560, height: 120, props: { fontSize: 16 } },
                    mobile: { x: 26, y: 210, width: 323, height: 154, props: { fontSize: 16 } },
                },
            }),
            createCanvasElement('section', 0, 360, {
                id: 'about-values-section',
                width: 1200,
                height: 330,
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                responsive: {
                    tablet: { y: 340, width: 768, height: 620 },
                    mobile: { y: 430, width: 375, height: 660 },
                },
                children: ['Craft', 'Clarity', 'Ownership'].map((item, index) => createCanvasElement('box', 80 + index * 330, 74, {
                    id: `about-value-${index}`,
                    width: 280,
                    height: 160,
                    props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                    responsive: {
                        tablet: { x: 54, y: 74 + index * 166, width: 660, height: 140 },
                        mobile: { x: 24, y: 62 + index * 180, width: 327, height: 150 },
                    },
                    children: [
                        createCanvasElement('heading', 22, 24, {
                            id: `about-value-heading-${index}`,
                            width: 220,
                            height: 38,
                            props: { content: item, level: 'h3', fontSize: 22, fontWeight: '750', color: '#0f172a' },
                            responsive: {
                                tablet: { width: 300 },
                                mobile: { width: 260 },
                            },
                        }),
                        createCanvasElement('paragraph', 22, 76, {
                            id: `about-value-copy-${index}`,
                            width: 220,
                            height: 60,
                            props: { content: 'Write a specific value statement that explains how the team makes decisions.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                            responsive: {
                                tablet: { width: 500, height: 42 },
                                mobile: { width: 260, height: 56 },
                            },
                        }),
                    ],
                })),
            }),
        ]);
    }

    if (input.template === 'contact') {
        return withChrome([
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
                    formActive: true,
                    formAudience: 'public',
                    successMessage: 'Thanks. We will reply soon.',
                    enableHoneypot: true,
                    enableCaptcha: false,
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
        ]);
    }

    if (input.template === 'newsletter') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'newsletter-hero-section',
                width: 1200,
                height: 640,
                props: { backgroundColor: '#fffbeb', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('text', 76, 70, {
                        id: 'newsletter-kicker',
                        width: 240,
                        height: 28,
                        props: { content: 'Newsletter', fontSize: 13, fontWeight: '800', color: '#b45309', textTransform: 'uppercase' },
                    }),
                    createCanvasElement('heading', 72, 112, {
                        id: 'newsletter-heading',
                        width: 560,
                        height: 112,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                    }),
                    createCanvasElement('paragraph', 76, 250, {
                        id: 'newsletter-copy',
                        width: 520,
                        height: 106,
                        props: { content: description, fontSize: 18, lineHeight: 1.62, color: '#4b5563' },
                    }),
                    createCanvasElement('box', 76, 400, {
                        id: 'newsletter-proof-card',
                        width: 470,
                        height: 120,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#fde68a', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 20, 20, {
                                id: 'newsletter-proof-heading',
                                width: 300,
                                height: 32,
                                props: { content: 'What subscribers receive', level: 'h3', fontSize: 19, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 20, 60, {
                                id: 'newsletter-proof-copy',
                                width: 390,
                                height: 48,
                                props: { content: 'Backy records the opt-in, chosen topics, source page, and consent state for follow-up workflows.', fontSize: 14, lineHeight: 1.45, color: '#65503c' },
                            }),
                        ],
                    }),
                    createCanvasElement('form', 700, 70, {
                        id: 'newsletter-signup-form',
                        width: 430,
                        height: 520,
                        props: {
                            formId: `form-${formSlug}-newsletter`,
                            formName: `${formSlug}-newsletter`,
                            formTitle: 'Newsletter signup',
                            formDescription: 'Public newsletter signup form generated from the page canvas.',
                            formActive: true,
                            formAudience: 'public',
                            successMessage: 'Subscription confirmed. Check your inbox for the next update.',
                            enableHoneypot: true,
                            enableCaptcha: false,
                            moderationMode: 'auto-approve',
                            contactShareEnabled: true,
                            contactShareNameField: 'first_name',
                            contactShareEmailField: 'email',
                            contactShareNotesField: 'topics',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            borderColor: '#fde68a',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            boxShadow: '0 20px 55px rgba(180, 83, 9, 0.12)',
                        },
                        children: [
                            createCanvasElement('heading', 24, 28, {
                                id: 'newsletter-form-heading',
                                width: 330,
                                height: 36,
                                props: { content: 'Subscribe for updates', level: 'h2', fontSize: 24, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('input', 24, 88, { id: 'newsletter-first-name', width: 360, height: 54, props: { label: 'First name', name: 'first_name', placeholder: 'Ada', required: false } }),
                            createCanvasElement('input', 24, 160, { id: 'newsletter-email', width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
                            createCanvasElement('select', 24, 232, {
                                id: 'newsletter-topic',
                                width: 360,
                                height: 54,
                                props: { label: 'Topic', name: 'topics', options: ['Product updates', 'Guides', 'Events', 'Offers'], placeholder: 'Choose a topic', required: true },
                            }),
                            createCanvasElement('checkbox', 24, 312, {
                                id: 'newsletter-consent',
                                width: 360,
                                height: 54,
                                props: { label: 'I agree to receive email updates and can unsubscribe anytime.', name: 'email_consent', required: true },
                            }),
                            createCanvasElement('input', 24, 382, {
                                id: 'newsletter-source',
                                width: 360,
                                height: 44,
                                props: { label: 'Signup source', name: 'signup_source', placeholder: 'Website newsletter page', required: false },
                            }),
                            createCanvasElement('button', 24, 448, {
                                id: 'newsletter-submit',
                                width: 170,
                                height: 48,
                                props: { label: 'Subscribe', backgroundColor: '#b45309', color: '#ffffff', borderRadius: 8, fontWeight: '800' },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 640, {
                id: 'newsletter-confirmation-section',
                width: 1200,
                height: 280,
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('box', 74, 60, {
                        id: 'newsletter-confirmation-card',
                        width: 500,
                        height: 150,
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'newsletter-confirmation-heading',
                                width: 360,
                                height: 34,
                                props: { content: 'Confirmation and consent', level: 'h2', fontSize: 24, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 24, 74, {
                                id: 'newsletter-confirmation-copy',
                                width: 420,
                                height: 54,
                                props: { content: 'Use Backy Forms moderation, contact sharing, and export hooks to route subscribers into your email provider without exposing provider secrets in the page.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                            }),
                        ],
                    }),
                    createCanvasElement('button', 780, 104, {
                        id: 'newsletter-manage-preferences-button',
                        width: 196,
                        height: 52,
                        props: { label: 'Manage preferences', href: '/preferences', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'newsletter.preferences.open' },
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'survey') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'survey-hero-section',
                width: 1200,
                height: 660,
                props: { backgroundColor: '#f5f3ff', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('text', 76, 70, {
                        id: 'survey-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Survey', fontSize: 13, fontWeight: '800', color: '#6d28d9', textTransform: 'uppercase' },
                    }),
                    createCanvasElement('heading', 72, 112, {
                        id: 'survey-heading',
                        width: 560,
                        height: 112,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                    }),
                    createCanvasElement('paragraph', 76, 250, {
                        id: 'survey-copy',
                        width: 520,
                        height: 106,
                        props: { content: description, fontSize: 18, lineHeight: 1.62, color: '#4b5563' },
                    }),
                    createCanvasElement('box', 76, 404, {
                        id: 'survey-insight-card',
                        width: 470,
                        height: 124,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#ddd6fe', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 20, 20, {
                                id: 'survey-insight-heading',
                                width: 330,
                                height: 32,
                                props: { content: 'Structured response capture', level: 'h3', fontSize: 19, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 20, 60, {
                                id: 'survey-insight-copy',
                                width: 390,
                                height: 50,
                                props: { content: 'Submissions land in Backy Forms with rating, choice, notes, contact, consent, and source metadata ready for export or collection routing.', fontSize: 14, lineHeight: 1.45, color: '#5b536c' },
                            }),
                        ],
                    }),
                    createCanvasElement('form', 700, 58, {
                        id: 'survey-response-form',
                        width: 430,
                        height: 560,
                        props: {
                            formId: `form-${formSlug}-survey`,
                            formName: `${formSlug}-survey`,
                            formTitle: 'Survey response',
                            formDescription: 'Public survey form generated from the page canvas.',
                            formActive: true,
                            formAudience: 'public',
                            successMessage: 'Thanks. Your response has been recorded.',
                            enableHoneypot: true,
                            enableCaptcha: false,
                            moderationMode: 'manual',
                            contactShareEnabled: true,
                            contactShareNameField: 'name',
                            contactShareEmailField: 'email',
                            contactShareNotesField: 'feedback',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            borderColor: '#ddd6fe',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            boxShadow: '0 20px 55px rgba(109, 40, 217, 0.12)',
                        },
                        children: [
                            createCanvasElement('heading', 24, 26, {
                                id: 'survey-form-heading',
                                width: 330,
                                height: 36,
                                props: { content: 'Share your feedback', level: 'h2', fontSize: 24, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('select', 24, 86, {
                                id: 'survey-rating',
                                width: 360,
                                height: 54,
                                props: { label: 'Overall rating', name: 'rating', options: ['5 - Excellent', '4 - Good', '3 - Okay', '2 - Needs work', '1 - Poor'], placeholder: 'Choose a rating', required: true },
                            }),
                            createCanvasElement('select', 24, 158, {
                                id: 'survey-topic',
                                width: 360,
                                height: 54,
                                props: { label: 'Topic', name: 'topic', options: ['Product', 'Support', 'Content', 'Pricing', 'Other'], placeholder: 'Choose a topic', required: true },
                            }),
                            createCanvasElement('textarea', 24, 230, {
                                id: 'survey-feedback',
                                width: 360,
                                height: 92,
                                props: { label: 'Feedback', name: 'feedback', placeholder: 'Tell us what worked or what should change', required: true },
                            }),
                            createCanvasElement('input', 24, 344, {
                                id: 'survey-email',
                                width: 360,
                                height: 54,
                                props: { label: 'Email for follow-up', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: false },
                            }),
                            createCanvasElement('checkbox', 24, 420, {
                                id: 'survey-consent',
                                width: 360,
                                height: 48,
                                props: { label: 'I agree that this response may be used to improve the experience.', name: 'survey_consent', required: true },
                            }),
                            createCanvasElement('button', 24, 492, {
                                id: 'survey-submit',
                                width: 180,
                                height: 48,
                                props: { label: 'Submit survey', backgroundColor: '#6d28d9', color: '#ffffff', borderRadius: 8, fontWeight: '800' },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 660, {
                id: 'survey-summary-section',
                width: 1200,
                height: 300,
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('box', 74, 64, {
                        id: 'survey-routing-card',
                        width: 510,
                        height: 160,
                        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 24, 24, {
                                id: 'survey-routing-heading',
                                width: 360,
                                height: 34,
                                props: { content: 'Route responses', level: 'h2', fontSize: 24, fontWeight: '800', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 24, 74, {
                                id: 'survey-routing-copy',
                                width: 430,
                                height: 60,
                                props: { content: 'Use Backy Forms exports, contacts, webhooks, and collection routing to analyze survey results without exposing analytics or email-provider secrets in the page.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                            }),
                        ],
                    }),
                    createCanvasElement('button', 780, 110, {
                        id: 'survey-results-button',
                        width: 178,
                        height: 52,
                        props: { label: 'View results', href: '/forms', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontWeight: '800', action: 'survey.results.open' },
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'registration') {
        return withChrome([
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
                            formActive: true,
                            formAudience: 'public',
                            successMessage: 'Registration received. Check your inbox for the next step.',
                            enableHoneypot: true,
                            enableCaptcha: false,
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
        ]);
    }

    if (input.template === 'member-login') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'member-login-hero-section',
                width: 1200,
                height: 610,
                props: { backgroundColor: '#eef7ff', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('text', 76, 76, {
                        id: 'member-login-kicker',
                        width: 260,
                        height: 28,
                        props: { content: 'Member access', fontSize: 13, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
                    }),
                    createCanvasElement('heading', 72, 116, {
                        id: 'member-login-heading',
                        width: 540,
                        height: 116,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#0f172a' },
                    }),
                    createCanvasElement('paragraph', 76, 256, {
                        id: 'member-login-copy',
                        width: 510,
                        height: 112,
                        props: { content: description, fontSize: 18, lineHeight: 1.62, color: '#334155' },
                    }),
                    createCanvasElement('box', 76, 410, {
                        id: 'member-login-register-card',
                        width: 480,
                        height: 104,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bae6fd', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('paragraph', 20, 18, {
                                id: 'member-login-register-copy',
                                width: 290,
                                height: 58,
                                props: { content: 'New here? Send visitors to your registration page or membership checkout.', fontSize: 14, lineHeight: 1.45, color: '#475569' },
                            }),
                            createCanvasElement('button', 326, 27, {
                                id: 'member-login-register-button',
                                width: 126,
                                height: 46,
                                props: { label: 'Register', href: '/register', backgroundColor: '#e0f2fe', color: '#075985', borderRadius: 8, fontWeight: '700' },
                            }),
                        ],
                    }),
                    createCanvasElement('form', 700, 84, {
                        id: 'member-login-access-form',
                        width: 420,
                        height: 390,
                        props: {
                            formId: `form-${formSlug}-member-login`,
                            formName: `${formSlug}-member-login`,
                            formTitle: 'Member access request',
                            formDescription: 'Email-only member access request generated from the page canvas.',
                            formActive: true,
                            formAudience: 'public',
                            successMessage: 'Check your inbox for the next access step.',
                            enableHoneypot: true,
                            enableCaptcha: false,
                            moderationMode: 'auto-approve',
                            contactShareEnabled: true,
                            contactShareEmailField: 'email',
                            contactShareNotesField: 'access_reason',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            borderColor: '#bae6fd',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            boxShadow: '0 20px 60px rgba(14, 116, 144, 0.12)',
                        },
                        children: [
                            createCanvasElement('heading', 24, 28, {
                                id: 'member-login-form-heading',
                                width: 330,
                                height: 36,
                                props: { content: 'Request your access link', level: 'h2', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                            }),
                            createCanvasElement('paragraph', 24, 76, {
                                id: 'member-login-form-copy',
                                width: 330,
                                height: 58,
                                props: { content: 'This starter never asks visitors to submit a password into Backy Forms.', fontSize: 14, lineHeight: 1.45, color: '#64748b' },
                            }),
                            createCanvasElement('input', 24, 158, { id: 'member-login-email', width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
                            createCanvasElement('input', 24, 230, { id: 'member-login-access-reason', width: 360, height: 54, props: { label: 'Access reason', name: 'access_reason', placeholder: 'Customer portal, course, community...', required: false } }),
                            createCanvasElement('button', 24, 316, { id: 'member-login-submit', width: 190, height: 50, props: { label: 'Send access link', backgroundColor: '#0369a1', color: '#ffffff', borderRadius: 8, fontWeight: '700' } }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    if (input.template === 'member-account') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'member-account-hero-section',
                width: 1200,
                height: 720,
                props: { backgroundColor: '#f0fdf4', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('text', 76, 70, {
                        id: 'member-account-kicker',
                        width: 260,
                        height: 28,
                        props: { content: 'Private member area', fontSize: 13, fontWeight: '800', color: '#047857', textTransform: 'uppercase' },
                    }),
                    createCanvasElement('heading', 72, 112, {
                        id: 'member-account-heading',
                        width: 560,
                        height: 112,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#0f172a' },
                    }),
                    createCanvasElement('paragraph', 76, 248, {
                        id: 'member-account-copy',
                        width: 520,
                        height: 104,
                        props: { content: description, fontSize: 18, lineHeight: 1.62, color: '#334155' },
                    }),
                    createCanvasElement('box', 76, 398, {
                        id: 'member-account-profile-card',
                        width: 500,
                        height: 150,
                        dataBindings: [{ source: 'member', mode: 'profile', fields: ['name', 'email', 'status'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#bbf7d0', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 22, 22, {
                                id: 'member-account-profile-heading',
                                width: 290,
                                height: 34,
                                props: { content: 'Welcome back, member', level: 'h2', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                            }),
                            createCanvasElement('paragraph', 22, 70, {
                                id: 'member-account-profile-copy',
                                width: 370,
                                height: 52,
                                props: { content: 'Bind this card to the authenticated member profile in your custom frontend.', fontSize: 14, lineHeight: 1.45, color: '#475569' },
                            }),
                        ],
                    }),
                    createCanvasElement('form', 700, 84, {
                        id: 'member-account-preferences-form',
                        width: 420,
                        height: 420,
                        props: {
                            formId: `form-${formSlug}-member-account`,
                            formName: `${formSlug}-member-account`,
                            formTitle: 'Member preferences',
                            formDescription: 'Authenticated member preferences form generated from the page canvas.',
                            formActive: true,
                            formAudience: 'authenticated',
                            successMessage: 'Your preferences were received.',
                            enableHoneypot: true,
                            enableCaptcha: false,
                            moderationMode: 'auto-approve',
                            contactShareEnabled: true,
                            contactShareNameField: 'display_name',
                            contactShareEmailField: 'email',
                            contactShareNotesField: 'updates',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            borderColor: '#bbf7d0',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            boxShadow: '0 20px 60px rgba(22, 101, 52, 0.10)',
                        },
                        children: [
                            createCanvasElement('heading', 24, 28, {
                                id: 'member-account-form-heading',
                                width: 330,
                                height: 36,
                                props: { content: 'Update preferences', level: 'h2', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                            }),
                            createCanvasElement('input', 24, 90, { id: 'member-account-display-name', width: 360, height: 54, props: { label: 'Display name', name: 'display_name', placeholder: 'Ada Lovelace', required: true } }),
                            createCanvasElement('input', 24, 162, { id: 'member-account-email', width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
                            createCanvasElement('select', 24, 234, { id: 'member-account-updates', width: 360, height: 54, props: { label: 'Updates', name: 'updates', options: ['Product updates', 'Billing notices', 'Community digest'], placeholder: 'Choose updates', required: false } }),
                            createCanvasElement('button', 24, 330, { id: 'member-account-submit', width: 190, height: 50, props: { label: 'Save preferences', backgroundColor: '#047857', color: '#ffffff', borderRadius: 8, fontWeight: '700' } }),
                        ],
                    }),
                    createCanvasElement('section', 72, 590, {
                        id: 'member-account-resource-section',
                        width: 1056,
                        height: 110,
                        props: { backgroundColor: 'transparent', borderRadius: 0 },
                        children: ['Downloads', 'Orders', 'Support'].map((item, index) => createCanvasElement('box', index * 352, 0, {
                            id: `member-account-resource-${index}`,
                            width: 320,
                            height: 96,
                            dataBindings: [{ source: 'member', mode: item.toLowerCase() }],
                            props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#dcfce7', borderWidth: 1, borderStyle: 'solid' },
                            children: [
                                createCanvasElement('heading', 20, 20, {
                                    id: `member-account-resource-heading-${index}`,
                                    width: 230,
                                    height: 30,
                                    props: { content: item, level: 'h3', fontSize: 20, fontWeight: '750', color: '#0f172a' },
                                }),
                                createCanvasElement('text', 20, 58, {
                                    id: `member-account-resource-copy-${index}`,
                                    width: 250,
                                    height: 24,
                                    props: { content: 'Connect to protected member data.', fontSize: 13, color: '#64748b' },
                                }),
                            ],
                        })),
                    }),
                ],
            }),
        ]);
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
