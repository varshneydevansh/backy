import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Download,
  ExternalLink,
  History,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AdminContentApiError,
  bulkUpdateCollectionRecords,
  createCollection,
  createCollectionRecord,
  deleteCollection,
  deleteCollectionRecord,
  exportCollectionRecordsCsv,
  getPage,
  getUserPermissions,
  getSiteFrontendDesign,
  importCollectionRecordsCsv,
  listAdminAuditLogs,
  listCollectionRecords,
  listCollections,
  listPages,
  updateCollection,
  updateCollectionRecord,
  type Collection,
  type CollectionField,
  type CollectionFieldType,
  type CollectionPermissions,
  type CollectionRecord,
  type AdminAuditLog,
  type AdminUserPermissionMatrix,
} from '@/lib/adminContentApi';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { useStore, type Page } from '@/stores/mockStore';
import { useAuthStore, type User } from '@/stores/authStore';
import { cn, formatDate } from '@/lib/utils';
import type { SiteSettings } from '@backy-cms/core';

const DEFAULT_RECORD_PAGE_SIZE = 25;
const RECORD_PAGE_SIZES = [25, 50, 100] as const;
type RecordStatusFilter = CollectionRecord['status'] | '';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];

interface CollectionsSearch {
  siteId?: string;
  collectionId?: string;
  recordId?: string;
  search?: string;
  status?: RecordStatusFilter;
  fieldKey?: string;
  fieldValue?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

const RECORD_STATUS_FILTERS: RecordStatusFilter[] = ['', 'published', 'draft', 'scheduled', 'archived'];

const isRecordStatusFilter = (value: unknown): value is RecordStatusFilter => (
  typeof value === 'string' && RECORD_STATUS_FILTERS.includes(value as RecordStatusFilter)
);

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizedPositiveInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
};

const normalizedRecordPageSize = (value: unknown): number | undefined => {
  const parsed = normalizedPositiveInteger(value);
  return parsed && RECORD_PAGE_SIZES.includes(parsed as (typeof RECORD_PAGE_SIZES)[number]) ? parsed : undefined;
};

export const Route = createFileRoute('/collections')({
  validateSearch: (search: Record<string, unknown>): CollectionsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    collectionId: normalizedSearchString(search.collectionId),
    recordId: normalizedSearchString(search.recordId),
    search: normalizedSearchString(search.search),
    status: isRecordStatusFilter(search.status) ? search.status : undefined,
    fieldKey: normalizedSearchString(search.fieldKey),
    fieldValue: normalizedSearchString(search.fieldValue),
    sortBy: normalizedSearchString(search.sortBy),
    sortDirection: search.sortDirection === 'asc' || search.sortDirection === 'desc' ? search.sortDirection : undefined,
    limit: normalizedRecordPageSize(search.limit),
    offset: normalizedPositiveInteger(search.offset),
  }),
  component: CollectionsPage,
});

const FIELD_TYPES: CollectionFieldType[] = [
  'text',
  'richText',
  'number',
  'boolean',
  'date',
  'datetime',
  'image',
  'video',
  'file',
  'reference',
  'multiReference',
  'select',
  'tags',
  'url',
  'email',
  'phone',
  'slug',
  'json',
];

const DEFAULT_PERMISSIONS: CollectionPermissions = {
  publicRead: true,
  publicCreate: false,
  publicUpdate: false,
  publicDelete: false,
};

const COLLECTION_CONTROL_AREAS = [
  {
    title: 'Site scope',
    detail: 'Choose which website owns these schemas and records.',
    href: '#collections-site',
  },
  {
    title: 'API contract',
    detail: 'Public and admin URLs for lists, records, import, export, and bulk updates.',
    href: '#collections-api',
  },
  {
    title: 'Library',
    detail: 'Switch between reusable schemas for products, directories, content, and custom data.',
    href: '#collections-library',
  },
  {
    title: 'Schema builder',
    detail: 'Fields, routes, permissions, status, references, media fields, and validation.',
    href: '#collections-schema',
  },
  {
    title: 'Records',
    detail: 'Create, filter, import, export, publish, archive, and delete collection records.',
    href: '#collections-records',
  },
  {
    title: 'Access and activity',
    detail: 'Permission keys plus recent schema and record audit events for this site.',
    href: '#collections-audit',
  },
] as const;

const COLLECTION_PERMISSION_CONTRACT = [
  { key: 'collections.view', label: 'View schemas and records', detail: 'Required for list/detail reads and non-CSV record browsing.' },
  { key: 'collections.edit', label: 'Edit schemas and records', detail: 'Required for collection saves, record writes, imports, and bulk status updates.' },
  { key: 'collections.export', label: 'Export records', detail: 'Required for backend CSV exports from filtered record lists.' },
  { key: 'collections.delete', label: 'Delete schemas or records', detail: 'Required for destructive schema, record, and selected-record deletes.' },
] as const;

type CollectionPermissionKey = (typeof COLLECTION_PERMISSION_CONTRACT)[number]['key'];

const COLLECTION_PERMISSION_ROLE_DEFAULTS: Record<CollectionPermissionKey, Array<'owner' | 'admin' | 'editor' | 'viewer'>> = {
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'collections.edit': ['owner', 'admin', 'editor'],
  'collections.export': ['owner', 'admin'],
  'collections.delete': ['owner', 'admin'],
};

interface CollectionTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  useCase: string;
  permissions: CollectionPermissions;
  fields: CollectionField[];
}

interface FrontendCollectionTemplateBlueprint {
  name: string;
  slug: string;
  description: string;
  status: Collection['status'];
  permissions: CollectionPermissions;
  listRoutePattern: string;
  routePattern: string;
  fields: CollectionField[];
}

const COLLECTION_TEMPLATES: CollectionTemplate[] = [
  {
    id: 'directory',
    name: 'Directory',
    slug: 'directory',
    description: 'Reusable listing records for vendors, members, locations, resources, or agencies.',
    useCase: 'Public directory pages with filters, detail pages, contact links, and map/search metadata.',
    permissions: DEFAULT_PERMISSIONS,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
      { key: 'category', label: 'Category', type: 'select', required: true, unique: false, sortOrder: 20, options: ['Featured', 'Service', 'Resource', 'Partner'] },
      { key: 'summary', label: 'Summary', type: 'richText', required: false, unique: false, sortOrder: 30 },
      { key: 'image', label: 'Image', type: 'image', required: false, unique: false, sortOrder: 40 },
      { key: 'website', label: 'Website', type: 'url', required: false, unique: false, sortOrder: 50 },
      { key: 'email', label: 'Email', type: 'email', required: false, unique: false, sortOrder: 60 },
      { key: 'phone', label: 'Phone', type: 'phone', required: false, unique: false, sortOrder: 70 },
      { key: 'tags', label: 'Tags', type: 'tags', required: false, unique: false, sortOrder: 80, options: ['featured', 'local', 'premium'] },
    ],
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    slug: 'portfolio',
    description: 'Case studies, work samples, galleries, and project detail pages.',
    useCase: 'Design portfolio grids, client work pages, and featured project modules.',
    permissions: DEFAULT_PERMISSIONS,
    fields: [
      { key: 'title', label: 'Project title', type: 'text', required: true, unique: false, sortOrder: 10 },
      { key: 'client', label: 'Client', type: 'text', required: false, unique: false, sortOrder: 20 },
      { key: 'role', label: 'Role', type: 'text', required: false, unique: false, sortOrder: 30 },
      { key: 'cover_image', label: 'Cover image', type: 'image', required: false, unique: false, sortOrder: 40 },
      { key: 'gallery', label: 'Gallery files', type: 'file', required: false, unique: false, sortOrder: 50 },
      { key: 'summary', label: 'Summary', type: 'richText', required: false, unique: false, sortOrder: 60 },
      { key: 'project_url', label: 'Project URL', type: 'url', required: false, unique: false, sortOrder: 70 },
      { key: 'featured', label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 80, defaultValue: false },
    ],
  },
  {
    id: 'events',
    name: 'Events',
    slug: 'events',
    description: 'Events, webinars, launches, workshops, and scheduled listings.',
    useCase: 'Public event calendars with date filters, venue details, registration links, and archive pages.',
    permissions: DEFAULT_PERMISSIONS,
    fields: [
      { key: 'title', label: 'Event title', type: 'text', required: true, unique: false, sortOrder: 10 },
      { key: 'starts_at', label: 'Starts at', type: 'datetime', required: true, unique: false, sortOrder: 20 },
      { key: 'ends_at', label: 'Ends at', type: 'datetime', required: false, unique: false, sortOrder: 30 },
      { key: 'venue', label: 'Venue', type: 'text', required: false, unique: false, sortOrder: 40 },
      { key: 'event_type', label: 'Event type', type: 'select', required: false, unique: false, sortOrder: 50, options: ['Online', 'In person', 'Hybrid'] },
      { key: 'description', label: 'Description', type: 'richText', required: false, unique: false, sortOrder: 60 },
      { key: 'registration_url', label: 'Registration URL', type: 'url', required: false, unique: false, sortOrder: 70 },
      { key: 'hero_image', label: 'Hero image', type: 'image', required: false, unique: false, sortOrder: 80 },
    ],
  },
  {
    id: 'testimonials',
    name: 'Testimonials',
    slug: 'testimonials',
    description: 'Quotes, reviews, customer stories, and social proof blocks.',
    useCase: 'Reusable testimonial sliders, proof sections, review grids, and landing-page trust modules.',
    permissions: DEFAULT_PERMISSIONS,
    fields: [
      { key: 'quote', label: 'Quote', type: 'richText', required: true, unique: false, sortOrder: 10 },
      { key: 'person_name', label: 'Person name', type: 'text', required: true, unique: false, sortOrder: 20 },
      { key: 'role', label: 'Role', type: 'text', required: false, unique: false, sortOrder: 30 },
      { key: 'company', label: 'Company', type: 'text', required: false, unique: false, sortOrder: 40 },
      { key: 'avatar', label: 'Avatar', type: 'image', required: false, unique: false, sortOrder: 50 },
      { key: 'rating', label: 'Rating', type: 'number', required: false, unique: false, sortOrder: 60, defaultValue: 5 },
      { key: 'featured', label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 70, defaultValue: true },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    slug: 'team',
    description: 'People profiles for staff, creators, authors, partners, or contributors.',
    useCase: 'Team pages, author indexes, contributor cards, and people detail pages.',
    permissions: DEFAULT_PERMISSIONS,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, unique: false, sortOrder: 10 },
      { key: 'role', label: 'Role', type: 'text', required: false, unique: false, sortOrder: 20 },
      { key: 'bio', label: 'Bio', type: 'richText', required: false, unique: false, sortOrder: 30 },
      { key: 'avatar', label: 'Avatar', type: 'image', required: false, unique: false, sortOrder: 40 },
      { key: 'email', label: 'Email', type: 'email', required: false, unique: false, sortOrder: 50 },
      { key: 'links', label: 'Links JSON', type: 'json', required: false, unique: false, sortOrder: 60 },
      { key: 'department', label: 'Department', type: 'select', required: false, unique: false, sortOrder: 70, options: ['Leadership', 'Design', 'Engineering', 'Support'] },
    ],
  },
  {
    id: 'faqs',
    name: 'FAQs',
    slug: 'faqs',
    description: 'Question-and-answer records for help centers, product pages, and SEO sections.',
    useCase: 'FAQ accordions, knowledge-base groups, support pages, and schema-ready content blocks.',
    permissions: DEFAULT_PERMISSIONS,
    fields: [
      { key: 'question', label: 'Question', type: 'text', required: true, unique: true, sortOrder: 10 },
      { key: 'answer', label: 'Answer', type: 'richText', required: true, unique: false, sortOrder: 20 },
      { key: 'group', label: 'Group', type: 'select', required: false, unique: false, sortOrder: 30, options: ['General', 'Pricing', 'Support', 'Account'] },
      { key: 'sort_order', label: 'Sort order', type: 'number', required: false, unique: false, sortOrder: 40, defaultValue: 10 },
      { key: 'featured', label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 50, defaultValue: false },
    ],
  },
];

const COLLECTION_FRONTEND_SYSTEMS = [
  {
    key: 'schema',
    title: 'Schema modeling',
    detail: 'Field keys, labels, types, required/unique rules, options, references, defaults, and help text.',
  },
  {
    key: 'routing',
    title: 'Dynamic routing',
    detail: 'List and detail route templates resolve collection records into public frontend paths.',
  },
  {
    key: 'records',
    title: 'Record delivery',
    detail: 'Public record list/detail APIs power directories, portfolios, catalogs, teams, FAQs, and custom objects.',
  },
  {
    key: 'relations',
    title: 'References',
    detail: 'Reference and multi-reference fields connect reusable datasets without hardcoding frontend joins.',
  },
  {
    key: 'media',
    title: 'Media binding',
    detail: 'Image, video, and file fields connect collection records to Backy media and file delivery.',
  },
  {
    key: 'operations',
    title: 'Operations',
    detail: 'Admin import, export, filtering, bulk status updates, archive, delete, and CSV workflows.',
  },
] as const;

const COLLECTION_WORKFLOW_SURFACES = [
  {
    key: 'pages',
    title: 'Pages',
    detail: 'Bind records into list sections, detail pages, filters, repeaters, and dynamic page routes.',
    route: '/pages',
  },
  {
    key: 'media',
    title: 'Media',
    detail: 'Attach images, files, videos, fonts, downloads, and private assets through typed media fields.',
    route: '/media',
  },
  {
    key: 'products',
    title: 'Products',
    detail: 'Use products as a commerce-focused structured dataset with pricing, inventory, delivery, and checkout handoff.',
    route: '/products',
  },
  {
    key: 'forms',
    title: 'Forms',
    detail: 'Create public write paths for submissions, registrations, surveys, and visitor-created collection records.',
    route: '/forms',
  },
  {
    key: 'sites',
    title: 'Sites',
    detail: 'Coordinate collection list/detail route templates with site navigation, redirects, SEO, and manifests.',
    route: '/sites',
  },
  {
    key: 'settings',
    title: 'Settings',
    detail: 'Confirm database, storage, public API, auth, and deployment readiness before exposing dynamic records.',
    route: '/settings',
  },
] as const;

const COLLECTION_BINDING_TARGETS = [
  {
    key: 'repeater',
    title: 'Repeater/list sections',
    detail: 'Bind record arrays into grids, cards, tables, sliders, directories, catalogs, and filtered list blocks.',
  },
  {
    key: 'detail',
    title: 'Detail page routes',
    detail: 'Use route templates and record slugs to render one public detail page per record.',
  },
  {
    key: 'field',
    title: 'Element field bindings',
    detail: 'Map text, rich text, image, file, link, boolean, date, tag, and reference fields onto page components.',
  },
  {
    key: 'filters',
    title: 'Filters and sort controls',
    detail: 'Expose status, field, search, sort, and pagination state to frontend filter controls.',
  },
  {
    key: 'writes',
    title: 'Public write flows',
    detail: 'Use public-create collections for registrations, submissions, surveys, applications, and visitor-generated records.',
  },
  {
    key: 'media',
    title: 'Media and file fields',
    detail: 'Connect image, video, and file fields to the central media library and delivery URLs.',
  },
] as const;

const COLLECTION_DYNAMIC_LIST_VARIANTS = [
  {
    value: 'cards',
    label: 'Card grid',
    detail: 'Three-column card grid for directories and catalogs.',
  },
  {
    value: 'compact',
    label: 'Compact list',
    detail: 'Dense rows for FAQs, indexes, and resources.',
  },
  {
    value: 'showcase',
    label: 'Showcase list',
    detail: 'Large media-forward rows for portfolios and features.',
  },
] as const;

const COLLECTION_DYNAMIC_ITEM_VARIANTS = [
  {
    value: 'split',
    label: 'Split hero',
    detail: 'Media beside title, summary, and key facts.',
  },
  {
    value: 'centered',
    label: 'Centered story',
    detail: 'Centered long-form detail page with optional hero image.',
  },
  {
    value: 'directory',
    label: 'Field directory',
    detail: 'Two-column field directory for structured profiles.',
  },
] as const;

type CollectionDynamicListVariant = typeof COLLECTION_DYNAMIC_LIST_VARIANTS[number]['value'];
type CollectionDynamicItemVariant = typeof COLLECTION_DYNAMIC_ITEM_VARIANTS[number]['value'];

interface CollectionAuthoredDynamicTemplate {
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  capturedAt: string;
  canvasSize?: {
    width: number;
    height: number;
  };
  customCSS?: string;
  elements: unknown[];
}

interface CollectionAuthoredDynamicTemplateVersion extends CollectionAuthoredDynamicTemplate {
  id: string;
  version: number;
  elementCount: number;
}

interface CollectionDynamicTemplatesForm {
  list: {
    variant: CollectionDynamicListVariant;
    titleField: string;
    descriptionField: string;
    imageField: string;
    limit: number;
    authoredPageId: string;
    authoredPageTitle: string;
    authoredCapturedAt: string;
    authoredCanvas: CollectionAuthoredDynamicTemplate | null;
    authoredHistory: CollectionAuthoredDynamicTemplateVersion[];
  };
  item: {
    variant: CollectionDynamicItemVariant;
    titleField: string;
    descriptionField: string;
    imageField: string;
    detailFields: string[];
    authoredPageId: string;
    authoredPageTitle: string;
    authoredCapturedAt: string;
    authoredCanvas: CollectionAuthoredDynamicTemplate | null;
    authoredHistory: CollectionAuthoredDynamicTemplateVersion[];
  };
}

interface CollectionVisitorWritePolicyForm {
  createFieldMode: 'all' | 'selected';
  allowedCreateFields: string[];
  publicWriteToken: string;
  updateFieldMode: 'all' | 'selected';
  allowedUpdateFields: string[];
}

const defaultDynamicTemplates = (): CollectionDynamicTemplatesForm => ({
  list: {
    variant: 'cards',
    titleField: '',
    descriptionField: '',
    imageField: '',
    limit: 24,
    authoredPageId: '',
    authoredPageTitle: '',
    authoredCapturedAt: '',
    authoredCanvas: null,
    authoredHistory: [],
  },
  item: {
    variant: 'split',
    titleField: '',
    descriptionField: '',
    imageField: '',
    detailFields: [],
    authoredPageId: '',
    authoredPageTitle: '',
    authoredCapturedAt: '',
    authoredCanvas: null,
    authoredHistory: [],
  },
});

const defaultVisitorWritePolicy = (): CollectionVisitorWritePolicyForm => ({
  createFieldMode: 'all',
  allowedCreateFields: [],
  publicWriteToken: '',
  updateFieldMode: 'all',
  allowedUpdateFields: [],
});

const COLLECTION_SCHEMA_EXPORT_COLUMNS = [
  'collection_id',
  'active_site_id',
  'name',
  'slug',
  'status',
  'description',
  'public_read',
  'public_create',
  'public_update',
  'public_delete',
  'field_count',
  'required_field_count',
  'unique_field_count',
  'relation_field_count',
  'media_field_count',
  'field_keys',
  'field_types',
  'required_fields',
  'unique_fields',
  'relation_fields',
  'media_fields',
  'public_list_route',
  'public_item_route_template',
  'public_collections_url',
  'public_records_url',
  'public_record_by_slug_url',
  'admin_collection_url',
  'admin_records_url',
  'admin_import_url',
  'admin_bulk_url',
  'frontend_systems',
  'created_at',
  'updated_at',
] as const;

const normalizeSlug = (value: string, fallback: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
};

const createEmptyField = (sortOrder: number): CollectionField => ({
  key: `field_${sortOrder}`,
  label: `Field ${sortOrder}`,
  type: 'text',
  required: false,
  unique: false,
  sortOrder,
  helpText: null,
});

const RELATION_FIELD_TYPES: CollectionFieldType[] = ['reference', 'multiReference'];
const MEDIA_FIELD_TYPES: CollectionFieldType[] = ['image', 'video', 'file'];
const TEXT_FIELD_TYPES: CollectionFieldType[] = ['text', 'richText', 'slug', 'url', 'email', 'phone', 'select', 'tags'];

const findCollectionAuthoringField = (
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

const datasetFieldBinding = (field: CollectionField | null) => (
  field ? {
    fieldKey: field.key,
    label: field.label,
    type: field.type,
    path: `record.${field.key}`,
  } : null
);

const isLocalAdminHost = () => {
  if (typeof window === 'undefined') return false;

  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3001';
};

const getPublicBaseUrl = () => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const envBase = env.VITE_BACKY_PUBLIC_API_BASE_URL || env.VITE_PUBLIC_API_URL || env.VITE_API_BASE_URL || '';
  if (envBase) {
    return envBase.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '');
  }
  if (isLocalAdminHost()) {
    return 'http://localhost:3001';
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
};

const getAdminBaseUrl = () => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const envBase = (
    env.VITE_BACKY_ADMIN_API_BASE_URL ||
    env.VITE_ADMIN_API_URL ||
    env.VITE_BACKY_PUBLIC_API_BASE_URL ||
    env.VITE_PUBLIC_API_URL ||
    env.VITE_API_BASE_URL ||
    ''
  ).trim();

  if (envBase) {
    return `${envBase.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
  }
  if (isLocalAdminHost()) {
    return 'http://localhost:3001/api/admin';
  }
  return typeof window !== 'undefined'
    ? `${window.location.origin.replace(/\/$/, '')}/api/admin`
    : '';
};

const defaultCollectionListRoutePattern = (collectionSlug: string) => `/${collectionSlug || 'collection'}`;
const defaultCollectionRoutePattern = (collectionSlug: string) => `/${collectionSlug || 'collection'}/:recordSlug`;

const normalizeCollectionRoutePattern = (routePattern: string | null | undefined, collectionSlug: string) => {
  const fallback = defaultCollectionRoutePattern(collectionSlug);
  const raw = routePattern?.trim() || '';
  if (!raw) return fallback;

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const compact = withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return compact.split('/').includes(':recordSlug') ? compact : fallback;
};

const normalizeCollectionListRoutePattern = (routePattern: string | null | undefined, collectionSlug: string) => {
  const fallback = defaultCollectionListRoutePattern(collectionSlug);
  const raw = routePattern?.trim() || '';
  if (!raw) return fallback;

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const compact = withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return compact !== '/' && !compact.split('/').includes(':recordSlug') ? compact : fallback;
};

const buildCollectionRecordRoutePath = (collection: Collection, recordSlug: string) => (
  normalizeCollectionRoutePattern(collection.routePattern, collection.slug)
    .split('/')
    .map((segment) => {
      if (segment === ':collectionSlug') return encodeURIComponent(collection.slug);
      if (segment === ':recordSlug') return encodeURIComponent(recordSlug);
      return segment;
    })
    .join('/') || '/'
);

const buildCollectionRecordRouteTemplate = (collection: Collection) => (
  normalizeCollectionRoutePattern(collection.routePattern, collection.slug)
    .split('/')
    .map((segment) => {
      if (segment === ':collectionSlug') return collection.slug;
      if (segment === ':recordSlug') return '{recordSlug}';
      return segment;
    })
    .join('/') || '/'
);

const buildCollectionListRoutePath = (collection: Collection) => (
  normalizeCollectionListRoutePattern(collection.listRoutePattern, collection.slug)
    .split('/')
    .map((segment) => {
      if (segment === ':collectionSlug') return encodeURIComponent(collection.slug);
      return segment;
    })
    .join('/') || '/'
);

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const parseRecordValue = (field: CollectionField, value: string): unknown => {
  if (field.type === 'number') {
    return value.trim().length > 0 ? Number(value) : null;
  }
  if (field.type === 'boolean') {
    return value === 'true';
  }
  if (field.type === 'tags' || field.type === 'multiReference') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (field.type === 'json') {
    if (!value.trim()) return {};
    return JSON.parse(value);
  }
  return value;
};

const formatFieldOptions = (options: string[] | undefined) => (options || []).join('\n');

const parseFieldOptions = (value: string) => (
  value
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter(Boolean)
);

const cloneTemplateFields = (fields: CollectionField[]) => (
  fields.map((field, index) => ({
    ...field,
    id: field.id || `field-${index + 1}`,
    options: field.options ? [...field.options] : undefined,
    sortOrder: (index + 1) * 10,
  }))
);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const optionalStringFromRecord = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const optionalBooleanFromRecord = (record: Record<string, unknown> | undefined, key: string): boolean | undefined => {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

const optionalStringListFromRecord = (record: Record<string, unknown> | undefined, key: string): string[] | undefined => {
  const value = record?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
};

const normalizeVisitorWritePolicy = (
  metadata: unknown,
  fields: CollectionField[] = [],
): CollectionVisitorWritePolicyForm => {
  const defaults = defaultVisitorWritePolicy();
  if (!isPlainRecord(metadata)) return defaults;
  const policy = isPlainRecord(metadata.visitorWritePolicy) ? metadata.visitorWritePolicy : {};
  const fieldKeys = new Set(fields.map((field) => field.key).filter(Boolean));
  const allowedCreateFields = optionalStringListFromRecord(policy, 'allowedCreateFields') || [];
  const allowedUpdateFields = optionalStringListFromRecord(policy, 'allowedUpdateFields') || [];

  return {
    createFieldMode: policy.createFieldMode === 'selected' ? 'selected' : defaults.createFieldMode,
    allowedCreateFields: allowedCreateFields.filter((fieldKey) => fieldKeys.size === 0 || fieldKeys.has(fieldKey)),
    publicWriteToken: optionalStringFromRecord(policy, 'publicWriteToken') || optionalStringFromRecord(metadata, 'publicWriteToken') || '',
    updateFieldMode: policy.updateFieldMode === 'selected' ? 'selected' : defaults.updateFieldMode,
    allowedUpdateFields: allowedUpdateFields.filter((fieldKey) => fieldKeys.size === 0 || fieldKeys.has(fieldKey)),
  };
};

const collectionMetadataWithVisitorWritePolicy = (
  metadata: unknown,
  visitorWritePolicy: CollectionVisitorWritePolicyForm,
  fields: CollectionField[],
): Record<string, unknown> => {
  const baseMetadata = isPlainRecord(metadata) ? { ...metadata } : {};
  const fieldKeys = new Set(fields.map((field) => field.key).filter(Boolean));
  const allowedCreateFields = visitorWritePolicy.allowedCreateFields
    .filter((fieldKey) => fieldKeys.has(fieldKey));
  const allowedUpdateFields = visitorWritePolicy.allowedUpdateFields
    .filter((fieldKey) => fieldKeys.has(fieldKey));
  const publicWriteToken = visitorWritePolicy.publicWriteToken.trim();
  const hasCustomPolicy = (
    visitorWritePolicy.createFieldMode === 'selected' ||
    publicWriteToken ||
    visitorWritePolicy.updateFieldMode === 'selected'
  );

  delete baseMetadata.publicWriteToken;
  if (!hasCustomPolicy) {
    delete baseMetadata.visitorWritePolicy;
    return baseMetadata;
  }

  return {
    ...baseMetadata,
    visitorWritePolicy: {
      createFieldMode: visitorWritePolicy.createFieldMode,
      ...(visitorWritePolicy.createFieldMode === 'selected' ? { allowedCreateFields } : {}),
      ...(publicWriteToken ? { publicWriteToken } : {}),
      updateFieldMode: visitorWritePolicy.updateFieldMode,
      ...(visitorWritePolicy.updateFieldMode === 'selected' ? { allowedUpdateFields } : {}),
    },
  };
};

const normalizeCanvasSize = (value: unknown): CollectionAuthoredDynamicTemplate['canvasSize'] | undefined => {
  if (!isPlainRecord(value)) return undefined;
  const width = typeof value.width === 'number' ? value.width : Number(value.width);
  const height = typeof value.height === 'number' ? value.height : Number(value.height);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;
};

const normalizeAuthoredDynamicTemplate = (value: unknown): CollectionAuthoredDynamicTemplate | null => {
  if (!isPlainRecord(value) || !Array.isArray(value.elements)) return null;
  const pageId = optionalStringFromRecord(value, 'pageId') || '';
  const pageTitle = optionalStringFromRecord(value, 'pageTitle') || '';
  const pageSlug = optionalStringFromRecord(value, 'pageSlug') || '';
  const capturedAt = optionalStringFromRecord(value, 'capturedAt') || '';

  return {
    pageId,
    pageTitle,
    pageSlug,
    capturedAt,
    ...(normalizeCanvasSize(value.canvasSize) ? { canvasSize: normalizeCanvasSize(value.canvasSize) } : {}),
    ...(optionalStringFromRecord(value, 'customCSS') ? { customCSS: optionalStringFromRecord(value, 'customCSS') } : {}),
    elements: value.elements,
  };
};

const normalizeAuthoredDynamicTemplateHistory = (
  value: unknown,
): CollectionAuthoredDynamicTemplateVersion[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainRecord)
    .map((entry, index): CollectionAuthoredDynamicTemplateVersion | null => {
      const authoredTemplate = normalizeAuthoredDynamicTemplate(entry);
      if (!authoredTemplate) return null;
      const version = typeof entry.version === 'number' && Number.isFinite(entry.version)
        ? Math.max(1, Math.floor(entry.version))
        : index + 1;
      const fallbackId = `${authoredTemplate.pageId || 'template'}-${authoredTemplate.capturedAt || version}`;

      return {
        ...authoredTemplate,
        id: optionalStringFromRecord(entry, 'id') || normalizeSlug(fallbackId, `template-version-${version}`),
        version,
        elementCount: typeof entry.elementCount === 'number' && Number.isFinite(entry.elementCount)
          ? Math.max(0, Math.floor(entry.elementCount))
          : authoredTemplate.elements.length,
      };
    })
    .filter((entry): entry is CollectionAuthoredDynamicTemplateVersion => Boolean(entry))
    .sort((left, right) => right.version - left.version)
    .slice(0, 8);
};

const appendAuthoredDynamicTemplateHistory = (
  history: CollectionAuthoredDynamicTemplateVersion[],
  authoredCanvas: CollectionAuthoredDynamicTemplate,
): CollectionAuthoredDynamicTemplateVersion[] => {
  const nextVersion = history.reduce((maxVersion, entry) => Math.max(maxVersion, entry.version), 0) + 1;
  const id = normalizeSlug(
    `${authoredCanvas.pageId || 'template'}-${authoredCanvas.capturedAt || Date.now()}-${nextVersion}`,
    `template-version-${nextVersion}`,
  );

  return [
    {
      ...authoredCanvas,
      id,
      version: nextVersion,
      elementCount: authoredCanvas.elements.length,
    },
    ...history.filter((entry) => entry.id !== id),
  ].slice(0, 8);
};

const parsePageContentRecord = (page: Page): Record<string, unknown> | null => {
  if (!page.content) return null;
  if (isPlainRecord(page.content)) return page.content;
  if (typeof page.content !== 'string') return null;

  try {
    const parsed = JSON.parse(page.content);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const authoredDynamicTemplateFromPage = (page: Page): CollectionAuthoredDynamicTemplate | null => {
  const content = parsePageContentRecord(page);
  if (!content) return null;
  const contentDocument = isPlainRecord(content.contentDocument) ? content.contentDocument : {};
  const metadata = isPlainRecord(contentDocument.metadata) ? contentDocument.metadata : {};
  const elements = Array.isArray(content.elements)
    ? content.elements
    : Array.isArray(contentDocument.elements)
      ? contentDocument.elements
      : [];

  if (elements.length === 0) return null;

  return {
    pageId: page.id,
    pageTitle: page.title,
    pageSlug: page.slug,
    capturedAt: new Date().toISOString(),
    ...(normalizeCanvasSize(content.canvasSize) || normalizeCanvasSize(metadata.canvasSize)
      ? { canvasSize: normalizeCanvasSize(content.canvasSize) || normalizeCanvasSize(metadata.canvasSize) }
      : {}),
    ...(optionalStringFromRecord(content, 'customCSS') ? { customCSS: optionalStringFromRecord(content, 'customCSS') } : {}),
    elements: JSON.parse(JSON.stringify(elements)),
  };
};

const dynamicListVariantFromValue = (value: unknown): CollectionDynamicListVariant => (
  typeof value === 'string' && COLLECTION_DYNAMIC_LIST_VARIANTS.some((variant) => variant.value === value)
    ? value as CollectionDynamicListVariant
    : 'cards'
);

const dynamicItemVariantFromValue = (value: unknown): CollectionDynamicItemVariant => (
  typeof value === 'string' && COLLECTION_DYNAMIC_ITEM_VARIANTS.some((variant) => variant.value === value)
    ? value as CollectionDynamicItemVariant
    : 'split'
);

const normalizeDynamicTemplateLimit = (value: unknown): number => {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 48) : 24;
};

const normalizeDynamicTemplates = (
  metadata: Record<string, unknown> | null | undefined,
): CollectionDynamicTemplatesForm => {
  const defaults = defaultDynamicTemplates();
  const dynamicTemplates = isPlainRecord(metadata?.dynamicTemplates) ? metadata.dynamicTemplates : {};
  const list = isPlainRecord(dynamicTemplates.list) ? dynamicTemplates.list : {};
  const item = isPlainRecord(dynamicTemplates.item) ? dynamicTemplates.item : {};

  return {
    list: {
      variant: dynamicListVariantFromValue(list.variant),
      titleField: optionalStringFromRecord(list, 'titleField') || defaults.list.titleField,
      descriptionField: optionalStringFromRecord(list, 'descriptionField') || defaults.list.descriptionField,
      imageField: optionalStringFromRecord(list, 'imageField') || defaults.list.imageField,
      limit: normalizeDynamicTemplateLimit(list.limit),
      authoredPageId: optionalStringFromRecord(list, 'authoredPageId') || defaults.list.authoredPageId,
      authoredPageTitle: optionalStringFromRecord(list, 'authoredPageTitle') || defaults.list.authoredPageTitle,
      authoredCapturedAt: optionalStringFromRecord(list, 'authoredCapturedAt') || defaults.list.authoredCapturedAt,
      authoredCanvas: normalizeAuthoredDynamicTemplate(list.authoredCanvas),
      authoredHistory: normalizeAuthoredDynamicTemplateHistory(list.authoredHistory),
    },
    item: {
      variant: dynamicItemVariantFromValue(item.variant),
      titleField: optionalStringFromRecord(item, 'titleField') || defaults.item.titleField,
      descriptionField: optionalStringFromRecord(item, 'descriptionField') || defaults.item.descriptionField,
      imageField: optionalStringFromRecord(item, 'imageField') || defaults.item.imageField,
      detailFields: optionalStringListFromRecord(item, 'detailFields') || defaults.item.detailFields,
      authoredPageId: optionalStringFromRecord(item, 'authoredPageId') || defaults.item.authoredPageId,
      authoredPageTitle: optionalStringFromRecord(item, 'authoredPageTitle') || defaults.item.authoredPageTitle,
      authoredCapturedAt: optionalStringFromRecord(item, 'authoredCapturedAt') || defaults.item.authoredCapturedAt,
      authoredCanvas: normalizeAuthoredDynamicTemplate(item.authoredCanvas),
      authoredHistory: normalizeAuthoredDynamicTemplateHistory(item.authoredHistory),
    },
  };
};

const collectionMetadataWithDynamicTemplates = (
  currentMetadata: Record<string, unknown> | undefined,
  dynamicTemplates: CollectionDynamicTemplatesForm,
) => ({
  ...(currentMetadata || {}),
  dynamicTemplates,
});

const asCollectionFieldType = (value: unknown): CollectionFieldType => (
  typeof value === 'string' && FIELD_TYPES.includes(value as CollectionFieldType)
    ? value as CollectionFieldType
    : 'text'
);

const frontendTemplateContent = (template: SiteFrontendDesignTemplate): Record<string, unknown> => {
  const content = isPlainRecord(template.content) ? template.content : {};
  const collection = isPlainRecord(content.collection) ? content.collection : {};
  const schema = isPlainRecord(content.schema) ? content.schema : {};

  return {
    ...content,
    ...collection,
    ...schema,
  };
};

const frontendTemplateFieldsFromContent = (content: Record<string, unknown>): CollectionField[] => {
  const candidates = Array.isArray(content.fields)
    ? content.fields
    : Array.isArray(content.schemaFields)
      ? content.schemaFields
      : [];

  return candidates
    .filter(isPlainRecord)
    .map((field, index): CollectionField => {
      const key = normalizeSlug(optionalStringFromRecord(field, 'key') || optionalStringFromRecord(field, 'name') || `field-${index + 1}`, `field-${index + 1}`).replace(/-/g, '_');
      const options = optionalStringListFromRecord(field, 'options');

      return {
        id: optionalStringFromRecord(field, 'id') || `frontend-${key}`,
        key,
        label: optionalStringFromRecord(field, 'label') || optionalStringFromRecord(field, 'title') || key.replace(/_/g, ' '),
        type: asCollectionFieldType(field.type),
        required: optionalBooleanFromRecord(field, 'required') ?? false,
        unique: optionalBooleanFromRecord(field, 'unique') ?? false,
        sortOrder: (index + 1) * 10,
        helpText: optionalStringFromRecord(field, 'helpText') || optionalStringFromRecord(field, 'description') || null,
        ...(options ? { options } : {}),
        ...(optionalStringFromRecord(field, 'referenceCollectionId') ? { referenceCollectionId: optionalStringFromRecord(field, 'referenceCollectionId') } : {}),
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
      };
    });
};

const defaultFrontendCollectionFields = (): CollectionField[] => ([
  { id: 'frontend-title', key: 'title', label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
  { id: 'frontend-slug', key: 'slug', label: 'Slug', type: 'slug', required: true, unique: true, sortOrder: 20 },
  { id: 'frontend-summary', key: 'summary', label: 'Summary', type: 'richText', required: false, unique: false, sortOrder: 30 },
  { id: 'frontend-image', key: 'image', label: 'Image', type: 'image', required: false, unique: false, sortOrder: 40 },
  { id: 'frontend-tags', key: 'tags', label: 'Tags', type: 'tags', required: false, unique: false, sortOrder: 50 },
]);

const buildFrontendCollectionTemplateBlueprint = (template: SiteFrontendDesignTemplate): FrontendCollectionTemplateBlueprint => {
  const content = frontendTemplateContent(template);
  const name = optionalStringFromRecord(content, 'name') || optionalStringFromRecord(content, 'title') || template.name;
  const slug = normalizeSlug(optionalStringFromRecord(content, 'slug') || template.id || name, 'frontend-collection');
  const fields = frontendTemplateFieldsFromContent(content);

  return {
    name,
    slug,
    description: template.description || optionalStringFromRecord(content, 'description') || 'Collection seeded from the connected frontend design contract.',
    status: content.status === 'draft' || content.status === 'archived' ? content.status : 'published',
    permissions: {
      publicRead: optionalBooleanFromRecord(content, 'publicRead') ?? true,
      publicCreate: optionalBooleanFromRecord(content, 'publicCreate') ?? false,
      publicUpdate: optionalBooleanFromRecord(content, 'publicUpdate') ?? false,
      publicDelete: optionalBooleanFromRecord(content, 'publicDelete') ?? false,
    },
    listRoutePattern: normalizeCollectionListRoutePattern(
      optionalStringFromRecord(content, 'listRoutePattern') || optionalStringFromRecord(content, 'listRoute') || `/${slug}`,
      slug,
    ),
    routePattern: normalizeCollectionRoutePattern(
      template.routePattern || optionalStringFromRecord(content, 'routePattern') || optionalStringFromRecord(content, 'detailRoutePattern') || `/${slug}/:recordSlug`,
      slug,
    ),
    fields: fields.length > 0 ? fields : defaultFrontendCollectionFields(),
  };
};

const buildFrontendCollectionTemplateMetadata = (
  template: SiteFrontendDesignTemplate,
  frontendDesign: SiteFrontendDesignContract | null,
): Record<string, unknown> => ({
  frontendDesignTemplateId: template.id,
  frontendDesignTemplateName: template.name,
  frontendDesignSource: frontendDesign?.source,
  frontendDesignBindingHints: template.bindingHints || [],
  ...(template.routePattern ? { frontendDesignRoutePattern: template.routePattern } : {}),
  ...(frontendDesign?.tokens ? { frontendDesignTokens: frontendDesign.tokens } : {}),
  ...(frontendDesign?.chrome ? { frontendDesignChrome: frontendDesign.chrome } : {}),
  ...(frontendDesign?.tokens?.customCss ? { frontendDesignCustomCss: frontendDesign.tokens.customCss } : {}),
});

const stripFrontendCollectionTemplateMetadata = (
  metadata: Record<string, unknown>,
): Record<string, unknown> => {
  const {
    frontendDesignTemplateId,
    frontendDesignTemplateName,
    frontendDesignSource,
    frontendDesignBindingHints,
    frontendDesignRoutePattern,
    frontendDesignTokens,
    frontendDesignChrome,
    frontendDesignCustomCss,
    ...rest
  } = metadata;

  void frontendDesignTemplateId;
  void frontendDesignTemplateName;
  void frontendDesignSource;
  void frontendDesignBindingHints;
  void frontendDesignRoutePattern;
  void frontendDesignTokens;
  void frontendDesignChrome;
  void frontendDesignCustomCss;

  return rest;
};

const getCollectionFrontendTemplateId = (collection: Collection): string | undefined => (
  typeof collection.metadata?.frontendDesignTemplateId === 'string'
    ? collection.metadata.frontendDesignTemplateId
    : undefined
);

const formatValidationDetails = (details: unknown): string[] => {
  if (!Array.isArray(details)) return [];

  return details
    .map((detail) => {
      if (!detail || typeof detail !== 'object') {
        return '';
      }

      const item = detail as {
        field?: unknown;
        row?: unknown;
        slug?: unknown;
        message?: unknown;
        details?: unknown;
      };
      const message = typeof item.message === 'string' ? item.message : '';
      const field = typeof item.field === 'string' ? item.field : '';
      const row = typeof item.row === 'number' ? `Row ${item.row}` : '';
      const nested = formatValidationDetails(item.details);
      const prefix = [row, field].filter(Boolean).join(' ');
      const body = [message, ...nested].filter(Boolean).join(' ');

      return [prefix, body].filter(Boolean).join(': ');
    })
    .filter(Boolean);
};

const collectionPermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: CollectionPermissionKey,
) => permissionMatrix?.groups
  .flatMap((group) => group.permissions)
  .find((permission) => permission.key === key) || null;

const isCollectionPermissionAllowed = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: User | null,
  key: CollectionPermissionKey,
): boolean => {
  const matrixRule = collectionPermissionRule(permissionMatrix, key);
  if (matrixRule) {
    return matrixRule.allowed;
  }
  return Boolean(currentAdmin && COLLECTION_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role));
};

const collectionPermissionReason = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: User | null,
  key: CollectionPermissionKey,
): string => {
  const matrixRule = collectionPermissionRule(permissionMatrix, key);
  if (matrixRule) {
    return matrixRule.reason;
  }
  if (!currentAdmin) {
    return 'Sign in with an admin account to use this capability.';
  }
  return COLLECTION_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)
    ? `Allowed by ${currentAdmin.role} role defaults.`
    : `Blocked by ${currentAdmin.role} role defaults.`;
};

function CollectionsPage() {
  const { sites } = useStore();
  const currentAdmin = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(routeSearch.collectionId || null);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(routeSearch.recordId || null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isCollectionDraftMode, setIsCollectionDraftMode] = useState(false);
  const [dynamicTemplatePreviewRecordId, setDynamicTemplatePreviewRecordId] = useState('');
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    slug: '',
    listRoutePattern: '',
    routePattern: '',
    description: '',
    status: 'published' as Collection['status'],
    permissions: DEFAULT_PERMISSIONS,
    frontendDesignTemplateId: '',
    dynamicTemplates: defaultDynamicTemplates(),
    visitorWritePolicy: defaultVisitorWritePolicy(),
    fields: [createEmptyField(10)],
  });
  const [recordForm, setRecordForm] = useState({
    slug: '',
    status: 'published' as CollectionRecord['status'],
    values: {} as Record<string, string>,
  });
  const [recordFilters, setRecordFilters] = useState({
    search: routeSearch.search || '',
    status: (routeSearch.status || '') as RecordStatusFilter,
    fieldKey: routeSearch.fieldKey || '',
    fieldValue: routeSearch.fieldValue || '',
    sortBy: routeSearch.sortBy || 'updatedAt',
    sortDirection: (routeSearch.sortDirection || 'desc') as 'asc' | 'desc',
  });
  const [recordPagination, setRecordPagination] = useState({
    total: 0,
    limit: routeSearch.limit || DEFAULT_RECORD_PAGE_SIZE,
    offset: routeSearch.offset || 0,
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRecordsLoading, setIsRecordsLoading] = useState(false);
  const [isPagesLoading, setIsPagesLoading] = useState(false);
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isExportingRecords, setIsExportingRecords] = useState(false);
  const [isImportingRecords, setIsImportingRecords] = useState(false);
  const [isCreatingFrontendTemplateId, setIsCreatingFrontendTemplateId] = useState<string | null>(null);
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [collectionAuditLogs, setCollectionAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationDetails, setValidationDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCollectionDelete, setPendingCollectionDelete] = useState<Collection | null>(null);
  const [pendingRecordDelete, setPendingRecordDelete] = useState<CollectionRecord | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const isCollectionMutationPending = isSavingCollection || isImportingRecords || isExportingRecords || Boolean(isCreatingFrontendTemplateId);
  const isRecordMutationPending = isSavingRecord || isImportingRecords || isExportingRecords;
  const isCollectionsBusy = isLoading || isRecordsLoading || isCollectionMutationPending || isRecordMutationPending;

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const activeSiteSlug = activeSite?.slug || activeSiteId;
  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) || null,
    [collections, selectedCollectionId],
  );
  const frontendCollectionTemplates = useMemo(
    () => (frontendDesign?.templates || []).filter((template) => template.type === 'collection'),
    [frontendDesign?.templates],
  );
  const frontendCollectionTemplateBlueprints = useMemo(
    () => frontendCollectionTemplates.map((template) => ({
      template,
      blueprint: buildFrontendCollectionTemplateBlueprint(template),
    })),
    [frontendCollectionTemplates],
  );
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) || null,
    [records, selectedRecordId],
  );
  const dynamicTemplatePreviewRecord = useMemo(
    () => records.find((record) => record.id === dynamicTemplatePreviewRecordId)
      || records.find((record) => record.status === 'published')
      || records[0]
      || null,
    [dynamicTemplatePreviewRecordId, records],
  );
  const dynamicBaseUrl = getPublicBaseUrl();
  const recordPage = Math.floor(recordPagination.offset / recordPagination.limit) + 1;
  const recordPageCount = Math.max(1, Math.ceil(recordPagination.total / recordPagination.limit));
  const recordRangeStart = recordPagination.total === 0 ? 0 : recordPagination.offset + 1;
  const recordRangeEnd = Math.min(recordPagination.total, recordPagination.offset + records.length);
  const selectedRecordsOnPage = records.filter((record) => selectedRecordIds.includes(record.id));
  const allRecordsOnPageSelected = records.length > 0 && selectedRecordsOnPage.length === records.length;
  const adminBaseUrl = getAdminBaseUrl();
  const apiCollectionSegment = activeCollection?.id ? encodeURIComponent(activeCollection.id) : '{collectionId}';
  const publicCollectionsUrl = `${dynamicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections`;
  const publicRecordsUrl = `${dynamicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${apiCollectionSegment}/records?limit=100`;
  const publicRecordBySlugUrl = `${dynamicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${apiCollectionSegment}/records?slug={recordSlug}`;
  const adminCollectionsUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections`;
  const adminRecordsUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections/${apiCollectionSegment}/records`;
  const adminImportUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections/${apiCollectionSegment}/records/import?upsert=true`;
  const adminBulkUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections/${apiCollectionSegment}/records/bulk`;
  const activeCollectionIsPublic = activeCollection?.status === 'published' && activeCollection.permissions?.publicRead === true;
  const recordsCopyUrl = activeCollectionIsPublic ? publicRecordsUrl : adminRecordsUrl;
  const recordsCopyLabel = activeCollectionIsPublic ? 'Public records URL' : 'Admin records URL';
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewCollections = !isPermissionMatrixPending && isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view');
  const canEditCollections = !isPermissionMatrixPending && isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.edit');
  const canExportCollections = !isPermissionMatrixPending && isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.export');
  const canDeleteCollections = !isPermissionMatrixPending && isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.delete');
  const schemaMutationDisabled = isCollectionsBusy || !canEditCollections;
  const recordMutationDisabled = isCollectionsBusy || !canEditCollections;
  const recordExportDisabled = isCollectionsBusy || !canExportCollections;
  const destructiveActionDisabled = isCollectionsBusy || !canDeleteCollections;
  const viewPermissionTitle = canViewCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.view');
  const editPermissionTitle = canEditCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.edit');
  const exportPermissionTitle = canExportCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.export');
  const deletePermissionTitle = canDeleteCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.delete');
  const activeSchemaFields = activeCollection?.fields.length
    ? activeCollection.fields
    : collectionForm.fields.filter((field) => field.key.trim() && field.label.trim());
  const activeListRoutePath = activeCollection
    ? buildCollectionListRoutePath(activeCollection)
    : normalizeCollectionListRoutePattern(collectionForm.listRoutePattern, collectionForm.slug || 'collection');
  const activeItemRoutePath = activeCollection
    ? buildCollectionRecordRouteTemplate(activeCollection)
    : normalizeCollectionRoutePattern(collectionForm.routePattern, collectionForm.slug || 'collection');
  const dynamicTemplatePreviewItemPath = activeCollection && dynamicTemplatePreviewRecord
    ? buildCollectionRecordRoutePath(activeCollection, dynamicTemplatePreviewRecord.slug)
    : activeItemRoutePath;
  const hostedListPreviewUrl = activeCollection
    ? `${dynamicBaseUrl}/sites/${activeSiteSlug}${activeListRoutePath}`
    : '';
  const hostedItemPreviewUrl = activeCollection && dynamicTemplatePreviewRecord
    ? `${dynamicBaseUrl}/sites/${activeSiteSlug}${dynamicTemplatePreviewItemPath}`
    : '';
  const renderListPreviewUrl = activeCollection
    ? `${dynamicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(activeListRoutePath)}`
    : '';
  const renderItemPreviewUrl = activeCollection && dynamicTemplatePreviewRecord
    ? `${dynamicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(dynamicTemplatePreviewItemPath)}`
    : '';
  const fieldHealth = useMemo(() => {
    const required = activeSchemaFields.filter((field) => field.required).length;
    const unique = activeSchemaFields.filter((field) => field.unique).length;
    const relational = activeSchemaFields.filter((field) => RELATION_FIELD_TYPES.includes(field.type)).length;
    const media = activeSchemaFields.filter((field) => MEDIA_FIELD_TYPES.includes(field.type)).length;
    const missingReferenceTargets = activeSchemaFields.filter((field) => (
      RELATION_FIELD_TYPES.includes(field.type) && !field.referenceCollectionId
    )).length;
    const missingSelectOptions = activeSchemaFields.filter((field) => (
      (field.type === 'select' || field.type === 'tags') && (!field.options || field.options.length === 0)
    )).length;

    return {
      required,
      unique,
      relational,
      media,
      missingReferenceTargets,
      missingSelectOptions,
    };
  }, [activeSchemaFields]);
  const collectionReadiness = useMemo(() => {
    const checks = [
      {
        label: 'Fields',
        detail: activeSchemaFields.length > 0
          ? `${activeSchemaFields.length} reusable fields`
          : 'Add fields before using this collection on a frontend.',
        ready: activeSchemaFields.length > 0,
      },
      {
        label: 'Routes',
        detail: activeListRoutePath && activeItemRoutePath
          ? `${activeListRoutePath} and ${activeItemRoutePath}`
          : 'List and item route patterns are required.',
        ready: Boolean(activeListRoutePath && activeItemRoutePath),
      },
      {
        label: 'Public delivery',
        detail: activeCollectionIsPublic
          ? 'Published collection is available to public frontend APIs.'
          : 'Enable published status and public read when this should be consumed by public pages.',
        ready: activeCollectionIsPublic,
      },
      {
        label: 'Field integrity',
        detail: fieldHealth.missingReferenceTargets || fieldHealth.missingSelectOptions
          ? `${fieldHealth.missingReferenceTargets + fieldHealth.missingSelectOptions} field setup issue${fieldHealth.missingReferenceTargets + fieldHealth.missingSelectOptions === 1 ? '' : 's'}`
          : 'References and option fields are configured.',
        ready: fieldHealth.missingReferenceTargets === 0 && fieldHealth.missingSelectOptions === 0,
      },
      {
        label: 'Visitor writes',
        detail: collectionForm.permissions.publicCreate
          ? 'Public create is enabled; submissions are stored as draft records.'
          : 'Visitor create is off; admin API controls writes.',
        ready: !collectionForm.permissions.publicCreate || activeSchemaFields.length > 0,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      checks,
      score: Math.round((readyCount / checks.length) * 100),
    };
  }, [
    activeCollectionIsPublic,
    activeItemRoutePath,
    activeListRoutePath,
    activeSchemaFields.length,
    collectionForm.permissions.publicCreate,
    fieldHealth.missingReferenceTargets,
    fieldHealth.missingSelectOptions,
  ]);
  const relationshipBrowser = useMemo(() => {
    const activeId = activeCollection?.id || '';
    const activeName = activeCollection?.name || collectionForm.name || 'Draft schema';
    const activeSlug = activeCollection?.slug || collectionForm.slug || 'draft';
    const outgoing = activeSchemaFields
      .filter((field) => RELATION_FIELD_TYPES.includes(field.type))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((field) => {
        const target = field.referenceCollectionId
          ? collections.find((collection) => collection.id === field.referenceCollectionId) || null
          : null;
        return {
          field,
          target,
          route: target ? buildCollectionListRoutePath(target) : '',
        };
      });
    const incoming = activeId
      ? collections.flatMap((sourceCollection) => (
          sourceCollection.fields
            .filter((field) => RELATION_FIELD_TYPES.includes(field.type) && field.referenceCollectionId === activeId)
            .map((field) => ({
              collection: sourceCollection,
              field,
              route: buildCollectionListRoutePath(sourceCollection),
            }))
        ))
      : [];
    const unmapped = collections.flatMap((sourceCollection) => (
      sourceCollection.fields
        .filter((field) => RELATION_FIELD_TYPES.includes(field.type) && !field.referenceCollectionId)
        .map((field) => ({
          collection: sourceCollection,
          field,
        }))
    ));
    const relatedCollectionIds = Array.from(new Set([
      ...outgoing.map((relationship) => relationship.target?.id).filter((id): id is string => Boolean(id)),
      ...incoming.map((relationship) => relationship.collection.id),
    ]));

    return {
      activeId,
      activeName,
      activeSlug,
      outgoing,
      incoming,
      unmapped,
      relatedCollectionIds,
    };
  }, [activeCollection, activeSchemaFields, collectionForm.name, collectionForm.slug, collections]);
  const collectionMetrics = useMemo(() => {
    const published = collections.filter((collection) => collection.status === 'published').length;
    const fields = collections.reduce((total, collection) => total + collection.fields.length, 0);

    return [
      { label: 'Collections', value: collections.length, detail: `${published} public schemas` },
      { label: 'Fields', value: fields, detail: 'Reusable data controls' },
      { label: 'Records loaded', value: recordPagination.total, detail: activeCollection?.name || 'No collection selected' },
      { label: 'Selected', value: selectedRecordIds.length, detail: 'Ready for bulk actions' },
    ];
  }, [activeCollection?.name, collections, recordPagination.total, selectedRecordIds.length]);
  const collectionWorkflow = useMemo(() => ([
    {
      label: 'Model',
      detail: 'Create the reusable schema, routes, fields, references, media bindings, and public write posture.',
    },
    {
      label: 'Populate',
      detail: 'Add records manually or import CSV data with validation feedback and slug normalization.',
    },
    {
      label: 'Operate',
      detail: 'Filter records, bulk publish/archive/delete, export CSV, and keep the dataset clean.',
    },
    {
      label: 'Expose',
      detail: 'Use public read APIs and route templates to power lists, detail pages, catalogs, and forms.',
    },
  ]), []);
  const datasetAuthoringShortcuts = useMemo(() => {
    if (!activeCollection) return null;

    const fields = [...activeCollection.fields].sort((a, b) => a.sortOrder - b.sortOrder);
    const titleField = findCollectionAuthoringField(fields, ['title', 'name', 'headline', 'label'], TEXT_FIELD_TYPES);
    const descriptionField = findCollectionAuthoringField(fields, ['summary', 'description', 'excerpt', 'body'], TEXT_FIELD_TYPES);
    const imageField = findCollectionAuthoringField(fields, ['image', 'photo', 'thumbnail', 'cover', 'avatar'], MEDIA_FIELD_TYPES);
    const slugField = findCollectionAuthoringField(fields, ['slug'], ['slug']);
    const filterFields = fields.filter((field) => ['select', 'tags', 'boolean', 'reference', 'multiReference'].includes(field.type)).slice(0, 4);
    const detailFields = fields
      .filter((field) => ![titleField?.key, descriptionField?.key, imageField?.key].includes(field.key))
      .slice(0, 8);
    const datasetId = `dataset_${activeCollection.id}`;
    const recordsUrl = activeCollectionIsPublic ? publicRecordsUrl : adminRecordsUrl;
    const recordBySlugUrl = activeCollectionIsPublic ? publicRecordBySlugUrl : `${adminRecordsUrl}?slug={recordSlug}`;
    const baseDataset = {
      id: datasetId,
      siteId: activeSiteId,
      collectionId: activeCollection.id,
      collectionSlug: activeCollection.slug,
      collectionName: activeCollection.name,
      status: activeCollection.status,
      publicReadReady: activeCollectionIsPublic,
      recordsUrl,
      recordBySlugUrl,
      listRoute: activeListRoutePath,
      itemRouteTemplate: activeItemRoutePath,
    };
    const repeaterPreset = {
      schemaVersion: 'backy.dataset-authoring.v1',
      type: 'collection-repeater',
      dataset: baseDataset,
      query: {
        status: 'published',
        sortBy: 'updatedAt',
        sortDirection: 'desc',
        limit: Math.min(recordPagination.limit || DEFAULT_RECORD_PAGE_SIZE, 24),
      },
      repeat: {
        recordAlias: 'record',
        emptyState: `No ${activeCollection.name.toLowerCase()} records yet.`,
      },
      bindings: {
        title: datasetFieldBinding(titleField),
        description: datasetFieldBinding(descriptionField),
        media: datasetFieldBinding(imageField),
        slug: datasetFieldBinding(slugField),
        detailHref: {
          template: activeItemRoutePath,
          recordSlugPath: 'record.slug',
        },
      },
      filters: filterFields.map((field) => ({
        fieldKey: field.key,
        label: field.label,
        type: field.type,
        path: `record.${field.key}`,
      })),
    };
    const fieldBindingPreset = {
      schemaVersion: 'backy.dataset-authoring.v1',
      type: 'collection-field-bindings',
      dataset: baseDataset,
      bindings: [
        { role: 'title', target: 'heading', binding: datasetFieldBinding(titleField) },
        { role: 'description', target: 'richText', binding: datasetFieldBinding(descriptionField) },
        { role: 'media', target: 'image', binding: datasetFieldBinding(imageField) },
        { role: 'detailHref', target: 'link', binding: { template: activeItemRoutePath, recordSlugPath: 'record.slug' } },
        ...detailFields.map((field) => ({
          role: `field.${field.key}`,
          target: MEDIA_FIELD_TYPES.includes(field.type) ? 'media' : 'text',
          binding: datasetFieldBinding(field),
        })),
      ].filter((binding) => Boolean(binding.binding)),
    };
    const listPageBrief = {
      schemaVersion: 'backy.dataset-authoring.v1',
      type: 'collection-list-page-brief',
      page: {
        suggestedTitle: activeCollection.name,
        suggestedPath: activeListRoutePath,
        createRoute: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}`,
      },
      dataset: baseDataset,
      repeaterPreset,
    };
    const itemPageBrief = {
      schemaVersion: 'backy.dataset-authoring.v1',
      type: 'collection-item-page-brief',
      page: {
        suggestedTitle: `${activeCollection.name} detail`,
        suggestedPathTemplate: activeItemRoutePath,
        createRoute: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}`,
      },
      dataset: baseDataset,
      fieldBindingPreset,
    };

    return {
      datasetId,
      titleField,
      descriptionField,
      imageField,
      filterFields,
      detailFields,
      repeaterPreset,
      fieldBindingPreset,
      listPageBrief,
      itemPageBrief,
      repeaterPresetText: JSON.stringify(repeaterPreset, null, 2),
      fieldBindingPresetText: JSON.stringify(fieldBindingPreset, null, 2),
      listPageBriefText: JSON.stringify(listPageBrief, null, 2),
      itemPageBriefText: JSON.stringify(itemPageBrief, null, 2),
      pagesCreateRoute: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}`,
    };
  }, [
    activeCollection,
    activeCollectionIsPublic,
    activeItemRoutePath,
    activeListRoutePath,
    activeSiteId,
    adminRecordsUrl,
    publicRecordBySlugUrl,
    publicRecordsUrl,
    recordPagination.limit,
  ]);
  const collectionHandoff = useMemo(() => ({
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
    },
    generatedAt: new Date().toISOString(),
    endpoints: {
      publicCollections: publicCollectionsUrl,
      publicRecords: publicRecordsUrl,
      publicRecordBySlug: publicRecordBySlugUrl,
      adminCollections: adminCollectionsUrl,
      adminRecords: adminRecordsUrl,
      adminImport: adminImportUrl,
      adminBulk: adminBulkUrl,
    },
    controlRoutes: {
      pages: `/pages?siteId=${encodeURIComponent(activeSiteId)}`,
      media: `/media?siteId=${encodeURIComponent(activeSiteId)}`,
      products: `/products?siteId=${encodeURIComponent(activeSiteId)}`,
      forms: `/forms?siteId=${encodeURIComponent(activeSiteId)}`,
      sites: '/sites',
      settings: '/settings',
    },
    export: {
      columns: COLLECTION_SCHEMA_EXPORT_COLUMNS,
    },
    frontendSystems: COLLECTION_FRONTEND_SYSTEMS,
    bindingContract: {
      model: 'Collections are the dataset layer for the page editor and custom frontends: one schema can power repeaters, detail routes, filters, field bindings, form writes, and media-backed records.',
      targets: COLLECTION_BINDING_TARGETS,
      activeCollection: activeCollection
        ? {
            id: activeCollection.id,
            slug: activeCollection.slug,
            listRoute: activeListRoutePath,
            detailRoute: activeItemRoutePath,
            previewRecord: dynamicTemplatePreviewRecord
              ? {
                  id: dynamicTemplatePreviewRecord.id,
                  slug: dynamicTemplatePreviewRecord.slug,
                  status: dynamicTemplatePreviewRecord.status,
                  itemRoute: dynamicTemplatePreviewItemPath,
                  hostedItemUrl: hostedItemPreviewUrl,
                  renderItemUrl: renderItemPreviewUrl,
                }
              : null,
            publicReadReady: activeCollectionIsPublic,
            publicCreateReady: activeCollection.permissions.publicCreate,
            visitorWritePolicy: normalizeVisitorWritePolicy(activeCollection.metadata, activeCollection.fields),
            authoringShortcuts: datasetAuthoringShortcuts
              ? {
                  datasetId: datasetAuthoringShortcuts.datasetId,
                  titleField: datasetAuthoringShortcuts.titleField?.key || null,
                  descriptionField: datasetAuthoringShortcuts.descriptionField?.key || null,
                  mediaField: datasetAuthoringShortcuts.imageField?.key || null,
                  filterFields: datasetAuthoringShortcuts.filterFields.map((field) => field.key),
                  listPageBrief: datasetAuthoringShortcuts.listPageBrief,
                  itemPageBrief: datasetAuthoringShortcuts.itemPageBrief,
                }
              : null,
          }
        : null,
    },
    templates: COLLECTION_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      slug: template.slug,
      description: template.description,
      useCase: template.useCase,
      permissions: template.permissions,
      fields: template.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        unique: field.unique,
        options: field.options,
        defaultValue: field.defaultValue,
        sortOrder: field.sortOrder,
      })),
    })),
    frontendDesign: frontendDesign ? {
      status: frontendDesign.status,
      source: frontendDesign.source,
      templateCount: frontendDesign.templates.length,
      collectionTemplates: frontendCollectionTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        routePattern: template.routePattern,
        bindingHints: template.bindingHints || [],
      })),
    } : null,
    readiness: {
      score: collectionReadiness.score,
      checks: collectionReadiness.checks,
    },
    metrics: {
      collections: collections.length,
      fields: collections.reduce((total, collection) => total + collection.fields.length, 0),
      recordsLoaded: recordPagination.total,
      selectedRecords: selectedRecordIds.length,
    },
    activeCollection: activeCollection ? {
      id: activeCollection.id,
      name: activeCollection.name,
      slug: activeCollection.slug,
      status: activeCollection.status,
      description: activeCollection.description,
      permissions: activeCollection.permissions,
      visitorWritePolicy: normalizeVisitorWritePolicy(activeCollection.metadata, activeCollection.fields),
      listRoutePattern: normalizeCollectionListRoutePattern(activeCollection.listRoutePattern, activeCollection.slug),
      routePattern: normalizeCollectionRoutePattern(activeCollection.routePattern, activeCollection.slug),
      listRoutePath: activeListRoutePath,
      itemRouteTemplate: activeItemRoutePath,
      templatePreview: {
        listRoutePath: activeListRoutePath,
        itemRoutePath: dynamicTemplatePreviewItemPath,
        hostedListUrl: hostedListPreviewUrl,
        hostedItemUrl: hostedItemPreviewUrl,
        renderListUrl: renderListPreviewUrl,
        renderItemUrl: renderItemPreviewUrl,
        record: dynamicTemplatePreviewRecord
          ? {
              id: dynamicTemplatePreviewRecord.id,
              slug: dynamicTemplatePreviewRecord.slug,
              status: dynamicTemplatePreviewRecord.status,
            }
          : null,
      },
      publicApiReady: activeCollectionIsPublic,
      frontendDesignTemplateId: getCollectionFrontendTemplateId(activeCollection),
      metadata: activeCollection.metadata || {},
      fields: activeCollection.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        unique: field.unique,
        helpText: field.helpText,
        options: field.options,
        defaultValue: field.defaultValue,
        referenceCollectionId: field.referenceCollectionId,
        sortOrder: field.sortOrder,
      })),
      fieldHealth,
    } : null,
    collections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      status: collection.status,
      permissions: collection.permissions,
      fieldCount: collection.fields.length,
      publicListRoute: buildCollectionListRoutePath(collection),
      publicItemRouteTemplate: buildCollectionRecordRouteTemplate(collection),
      publicReadReady: collection.status === 'published' && collection.permissions.publicRead,
      frontendDesignTemplateId: getCollectionFrontendTemplateId(collection),
    })),
    records: records.map((record) => ({
      id: record.id,
      slug: record.slug,
      status: record.status,
      routePath: activeCollection ? buildCollectionRecordRoutePath(activeCollection, record.slug) : null,
      valueKeys: Object.keys(record.values || {}),
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
    })),
    filters: recordFilters,
    pagination: recordPagination,
    selection: {
      selectedRecordIds,
      allRecordsOnPageSelected,
    },
    privacy: {
      includesRecordValues: false,
      note: 'Use public/admin record endpoints or CSV export for full record values. This manifest exposes schemas, routes, permissions, endpoints, counts, and record identifiers only.',
    },
  }), [
    activeCollection,
    activeCollectionIsPublic,
    activeItemRoutePath,
    activeListRoutePath,
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    adminBulkUrl,
    adminCollectionsUrl,
    adminImportUrl,
    adminRecordsUrl,
    allRecordsOnPageSelected,
    collectionReadiness.checks,
    collectionReadiness.score,
    collections,
    datasetAuthoringShortcuts,
    dynamicTemplatePreviewItemPath,
    dynamicTemplatePreviewRecord,
    fieldHealth,
    frontendCollectionTemplates,
    frontendDesign,
    hostedItemPreviewUrl,
    hostedListPreviewUrl,
    publicCollectionsUrl,
    publicRecordBySlugUrl,
    publicRecordsUrl,
    recordFilters,
    recordPagination,
    records,
    renderItemPreviewUrl,
    renderListPreviewUrl,
    selectedRecordIds,
  ]);
  const collectionHandoffText = useMemo(() => JSON.stringify(collectionHandoff, null, 2), [collectionHandoff]);
  const collectionsRouteSearch = useMemo<CollectionsSearch>(() => ({
    siteId: activeSiteId,
    ...(selectedCollectionId ? { collectionId: selectedCollectionId } : {}),
    ...(selectedRecordId ? { recordId: selectedRecordId } : {}),
    ...(recordFilters.search.trim() ? { search: recordFilters.search.trim() } : {}),
    ...(recordFilters.status ? { status: recordFilters.status } : {}),
    ...(recordFilters.fieldKey ? { fieldKey: recordFilters.fieldKey } : {}),
    ...(recordFilters.fieldValue.trim() ? { fieldValue: recordFilters.fieldValue.trim() } : {}),
    ...(recordFilters.sortBy !== 'updatedAt' ? { sortBy: recordFilters.sortBy } : {}),
    ...(recordFilters.sortDirection !== 'desc' ? { sortDirection: recordFilters.sortDirection } : {}),
    ...(recordPagination.limit !== DEFAULT_RECORD_PAGE_SIZE ? { limit: recordPagination.limit } : {}),
    ...(recordPagination.offset > 0 ? { offset: recordPagination.offset } : {}),
  }), [
    activeSiteId,
    recordFilters.fieldKey,
    recordFilters.fieldValue,
    recordFilters.search,
    recordFilters.sortBy,
    recordFilters.sortDirection,
    recordFilters.status,
    recordPagination.limit,
    recordPagination.offset,
    selectedCollectionId,
    selectedRecordId,
  ]);

  const updateCollectionsRouteSearch = (next: CollectionsSearch) => {
    const merged: CollectionsSearch = {
      ...collectionsRouteSearch,
      ...next,
    };
    const normalized: CollectionsSearch = {
      siteId: merged.siteId || activeSiteId,
      ...(merged.collectionId ? { collectionId: merged.collectionId } : {}),
      ...(merged.recordId ? { recordId: merged.recordId } : {}),
      ...(merged.search?.trim() ? { search: merged.search.trim() } : {}),
      ...(merged.status ? { status: merged.status } : {}),
      ...(merged.fieldKey ? { fieldKey: merged.fieldKey } : {}),
      ...(merged.fieldValue?.trim() ? { fieldValue: merged.fieldValue.trim() } : {}),
      ...(merged.sortBy && merged.sortBy !== 'updatedAt' ? { sortBy: merged.sortBy } : {}),
      ...(merged.sortDirection && merged.sortDirection !== 'desc' ? { sortDirection: merged.sortDirection } : {}),
      ...(merged.limit && merged.limit !== DEFAULT_RECORD_PAGE_SIZE ? { limit: merged.limit } : {}),
      ...(merged.offset && merged.offset > 0 ? { offset: merged.offset } : {}),
    };

    navigate({ to: '/collections', search: normalized, replace: true });
  };

  const updateRecordFilters = (updates: Partial<typeof recordFilters>) => {
    if (isCollectionsBusy) return;

    const nextFilters = { ...recordFilters, ...updates };
    setRecordFilters(nextFilters);
    setRecordPagination((prev) => ({ ...prev, offset: 0 }));
    updateCollectionsRouteSearch({
      search: nextFilters.search || undefined,
      status: nextFilters.status || undefined,
      fieldKey: nextFilters.fieldKey || undefined,
      fieldValue: nextFilters.fieldValue || undefined,
      sortBy: nextFilters.sortBy,
      sortDirection: nextFilters.sortDirection,
      offset: undefined,
    });
  };

  const toggleRecordSelection = (recordId: string, selected: boolean) => {
    if (isCollectionsBusy) return;

    setSelectedRecordIds((prev) => (
      selected
        ? [...new Set([...prev, recordId])]
        : prev.filter((id) => id !== recordId)
    ));
  };

  const togglePageRecordSelection = (selected: boolean) => {
    if (isCollectionsBusy) return;

    const pageIds = records.map((record) => record.id);
    setSelectedRecordIds((prev) => (
      selected
        ? [...new Set([...prev, ...pageIds])]
        : prev.filter((id) => !pageIds.includes(id))
    ));
  };

  const showApiError = (apiError: unknown, fallback: string) => {
    setError(apiError instanceof Error ? apiError.message : fallback);
    setValidationDetails(apiError instanceof AdminContentApiError
      ? formatValidationDetails(apiError.details)
      : []);
  };

  const showPermissionDenied = (key: CollectionPermissionKey, action: string) => {
    setNotice(null);
    setValidationDetails([]);
    setError(`Your account needs ${key} to ${action}. ${collectionPermissionReason(permissionMatrix, currentAdmin, key)}`);
  };

  const copyCollectionApiText = async (value: string, label: string) => {
    if (isCollectionsBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };
  const downloadCollectionHandoff = () => {
    if (isCollectionsBusy) return;

    const blob = new Blob([collectionHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSiteSlug}-backy-collections-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Collections handoff manifest downloaded.');
  };

  const downloadCollectionSchemaCsv = () => {
    if (isCollectionsBusy) return;
    if (collections.length === 0) return;

    const rows = collections.map((collection) => {
      const exportRecord = collectionToSchemaExportRecord(collection, {
        activeSiteId,
        publicBaseUrl: dynamicBaseUrl,
        adminBaseUrl,
      });
      return COLLECTION_SCHEMA_EXPORT_COLUMNS.map((column) => exportRecord[column]);
    });
    const csv = [COLLECTION_SCHEMA_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSiteSlug}-collection-schemas.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Collection schema CSV exported.');
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    let cancelled = false;

    const loadFrontendDesign = async () => {
      setFrontendDesignLoading(true);
      setFrontendDesignError(null);
      try {
        const response = await getSiteFrontendDesign(activeSiteId);
        if (!cancelled) {
          setFrontendDesign(response.frontendDesign);
        }
      } catch (loadError) {
        if (!cancelled) {
          setFrontendDesign(null);
          setFrontendDesignError(loadError instanceof Error ? loadError.message : 'Unable to load frontend design contract');
        }
      } finally {
        if (!cancelled) {
          setFrontendDesignLoading(false);
        }
      }
    };

    void loadFrontendDesign();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId]);

  useEffect(() => {
    let cancelled = false;

    const loadPageTemplates = async () => {
      setIsPagesLoading(true);
      setPagesError(null);
      try {
        const backendPages = await listPages(activeSiteId);
        if (!cancelled) {
          setPages(backendPages.filter((page) => page.status !== 'archived'));
        }
      } catch (loadError) {
        if (!cancelled) {
          setPages([]);
          setPagesError(loadError instanceof Error ? loadError.message : 'Unable to load pages for dynamic templates');
        }
      } finally {
        if (!cancelled) {
          setIsPagesLoading(false);
        }
      }
    };

    void loadPageTemplates();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId]);

  useEffect(() => {
    let cancelled = false;

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setPermissionError('Sign in with an admin account to load collection permissions.');
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    setPermissionError(null);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
        }
      })
      .catch((permissionLoadError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(permissionLoadError instanceof Error
            ? permissionLoadError.message
            : 'Unable to load collection permissions.');
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

  const resetCollectionForm = () => {
    setIsCollectionDraftMode(true);
    setSelectedCollectionId(null);
    setSelectedRecordId(null);
    setSelectedRecordIds([]);
    setDynamicTemplatePreviewRecordId('');
    setRecords([]);
    setRecordFilters({
      search: '',
      status: '',
      fieldKey: '',
      fieldValue: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    setRecordPagination({
      total: 0,
      limit: DEFAULT_RECORD_PAGE_SIZE,
      offset: 0,
      hasMore: false,
    });
    setCollectionForm({
      name: '',
      slug: '',
      listRoutePattern: '',
      routePattern: '',
      description: '',
      status: 'published',
      permissions: DEFAULT_PERMISSIONS,
      frontendDesignTemplateId: '',
      dynamicTemplates: defaultDynamicTemplates(),
      visitorWritePolicy: defaultVisitorWritePolicy(),
      fields: [createEmptyField(10)],
    });
    setRecordForm({ slug: '', status: 'published', values: {} });
  };

  const beginNewCollection = () => {
    if (schemaMutationDisabled) return;
    resetCollectionForm();
    navigate({ to: '/collections', search: { siteId: activeSiteId }, replace: true });
    setError(null);
    setValidationDetails([]);
    setNotice('New collection draft ready. Add a name and fields, then save the schema.');
    window.requestAnimationFrame(() => {
      document.getElementById('collections-schema')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      window.setTimeout(() => {
        document.getElementById('collections-schema-name')?.focus();
      }, 150);
    });
  };

  const resetCollectionsWorkspace = () => {
    setCollections([]);
    resetCollectionForm();
    setIsCollectionDraftMode(false);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
  };

  const selectCollectionsSite = (nextSiteId: string) => {
    if (isCollectionsBusy) return;

    setSelectedSiteId(nextSiteId);
    resetCollectionsWorkspace();
    navigate({ to: '/collections', search: { siteId: nextSiteId }, replace: true });
  };
  const openCollectionWorkflowSurface = (surface: typeof COLLECTION_WORKFLOW_SURFACES[number]) => {
    if (isCollectionsBusy) return;

    if (surface.route === '/pages') {
      navigate({ to: '/pages', search: activeSiteSearch });
      return;
    }

    if (surface.route === '/media') {
      navigate({ to: '/media', search: activeSiteSearch });
      return;
    }

    if (surface.route === '/products') {
      navigate({ to: '/products', search: activeSiteSearch });
      return;
    }

    if (surface.route === '/forms') {
      navigate({ to: '/forms', search: activeSiteSearch });
      return;
    }

    if (surface.route === '/sites') {
      navigate({ to: '/sites' });
      return;
    }

    navigate({ to: '/settings', search: { tab: 'infrastructure' } });
  };
  const openDatasetPageBuilder = (mode: 'list' | 'item') => {
    if (isCollectionsBusy || !activeCollection) return;

    const suggestedTitle = mode === 'item' ? `${activeCollection.name} detail` : activeCollection.name;
    const suggestedSlug = mode === 'item' ? `${activeCollection.slug}-detail` : `${activeCollection.slug}-list`;
    navigate({
      to: '/pages/new',
      search: {
        ...activeSiteSearch,
        collectionId: activeCollection.id,
        datasetMode: mode,
        title: suggestedTitle,
        slug: suggestedSlug,
        description: activeCollection.description || `A dynamic ${mode} page for ${activeCollection.name}.`,
        nav: mode === 'list' ? 'primary' : 'none',
        navLabel: activeCollection.name,
      },
    });
  };

  useEffect(() => {
    const nextSiteId = routeSearch.siteId
      ? getSiteSelectionFromSearch(sites, routeSearch.siteId)
      : selectedSiteId;
    const siteChanged = nextSiteId !== selectedSiteId;

    if (siteChanged) {
      setSelectedSiteId(nextSiteId);
      resetCollectionsWorkspace();
    }

    if (isCollectionDraftMode) {
      if (routeSearch.collectionId) {
        navigate({ to: '/collections', search: { siteId: nextSiteId }, replace: true });
      }
      return;
    }

    setSelectedCollectionId(routeSearch.collectionId || null);
    setSelectedRecordId(routeSearch.recordId || null);
    setSelectedRecordIds([]);
    setRecordFilters({
      search: routeSearch.search || '',
      status: routeSearch.status || '',
      fieldKey: routeSearch.fieldKey || '',
      fieldValue: routeSearch.fieldValue || '',
      sortBy: routeSearch.sortBy || 'updatedAt',
      sortDirection: routeSearch.sortDirection || 'desc',
    });
    setRecordPagination((prev) => ({
      ...prev,
      limit: routeSearch.limit || DEFAULT_RECORD_PAGE_SIZE,
      offset: routeSearch.offset || 0,
    }));
  }, [
    routeSearch.collectionId,
    routeSearch.fieldKey,
    routeSearch.fieldValue,
    routeSearch.limit,
    routeSearch.offset,
    routeSearch.recordId,
    routeSearch.search,
    routeSearch.siteId,
    routeSearch.sortBy,
    routeSearch.sortDirection,
    routeSearch.status,
    isCollectionDraftMode,
    navigate,
    selectedSiteId,
    sites,
  ]);

  const applyCollectionTemplate = (template: CollectionTemplate) => {
    if (isCollectionsBusy) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'prepare a collection template');
      return;
    }

    setIsCollectionDraftMode(true);
    setSelectedCollectionId(null);
    setSelectedRecordId(null);
    setSelectedRecordIds([]);
    setRecords([]);
    setRecordFilters({
      search: '',
      status: '',
      fieldKey: '',
      fieldValue: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    setRecordPagination({
      total: 0,
      limit: DEFAULT_RECORD_PAGE_SIZE,
      offset: 0,
      hasMore: false,
    });
    setCollectionForm({
      name: template.name,
      slug: template.slug,
      listRoutePattern: defaultCollectionListRoutePattern(template.slug),
      routePattern: defaultCollectionRoutePattern(template.slug),
      description: template.description,
      status: 'published',
      permissions: { ...template.permissions },
      frontendDesignTemplateId: '',
      dynamicTemplates: defaultDynamicTemplates(),
      visitorWritePolicy: defaultVisitorWritePolicy(),
      fields: cloneTemplateFields(template.fields),
    });
    setRecordForm({ slug: '', status: 'published', values: {} });
    setError(null);
    setValidationDetails([]);
    setNotice(`${template.name} template loaded. Review fields, then save the schema.`);
    window.requestAnimationFrame(() => {
      document.getElementById('collections-schema')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const createCollectionFromFrontendTemplate = async (
    template: SiteFrontendDesignTemplate,
    blueprint: FrontendCollectionTemplateBlueprint,
  ) => {
    if (isCollectionsBusy) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'create a collection from a frontend template');
      return;
    }

    setIsCreatingFrontendTemplateId(template.id);
    setIsSavingCollection(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);

    try {
      const metadata = collectionMetadataWithDynamicTemplates(
        buildFrontendCollectionTemplateMetadata(template, frontendDesign),
        defaultDynamicTemplates(),
      );
      const saved = await createCollection(activeSiteId, {
        name: blueprint.name,
        slug: blueprint.slug,
        listRoutePattern: blueprint.listRoutePattern,
        routePattern: blueprint.routePattern,
        description: blueprint.description,
        status: blueprint.status,
        permissions: blueprint.permissions,
        fields: cloneTemplateFields(blueprint.fields),
        metadata,
      });

      setCollections((prev) => [saved, ...prev.filter((collection) => collection.id !== saved.id)]);
      selectCollection(saved);
      setNotice(`${saved.name} created from frontend design template ${template.name}.`);
    } catch (saveError) {
      showApiError(saveError, 'Unable to create collection from frontend design template');
    } finally {
      setIsCreatingFrontendTemplateId(null);
      setIsSavingCollection(false);
    }
  };

  const selectCollection = (collection: Collection, preserveRouteState = false) => {
    setIsCollectionDraftMode(false);
    setSelectedCollectionId(collection.id);
    setSelectedRecordId(preserveRouteState ? routeSearch.recordId || null : null);
    setSelectedRecordIds([]);
    setRecordFilters((prev) => ({
      ...prev,
      fieldKey: preserveRouteState ? prev.fieldKey : '',
      fieldValue: preserveRouteState ? prev.fieldValue : '',
    }));
    setRecordPagination((prev) => ({
      ...prev,
      offset: preserveRouteState ? prev.offset : 0,
    }));
    setCollectionForm({
      name: collection.name,
      slug: collection.slug,
      listRoutePattern: normalizeCollectionListRoutePattern(collection.listRoutePattern, collection.slug),
      routePattern: normalizeCollectionRoutePattern(collection.routePattern, collection.slug),
      description: collection.description || '',
      status: collection.status,
      permissions: collection.permissions,
      frontendDesignTemplateId: getCollectionFrontendTemplateId(collection) || '',
      dynamicTemplates: normalizeDynamicTemplates(collection.metadata),
      visitorWritePolicy: normalizeVisitorWritePolicy(collection.metadata, collection.fields),
      fields: collection.fields.length > 0 ? collection.fields : [createEmptyField(10)],
    });
    setRecordForm({ slug: '', status: 'published', values: {} });
    updateCollectionsRouteSearch({
      collectionId: collection.id,
      recordId: preserveRouteState ? routeSearch.recordId : undefined,
      fieldKey: preserveRouteState ? recordFilters.fieldKey || undefined : undefined,
      fieldValue: preserveRouteState ? recordFilters.fieldValue || undefined : undefined,
      offset: preserveRouteState ? recordPagination.offset || undefined : undefined,
    });
  };

  const loadCollections = async () => {
    if (isCollectionsBusy) return;

    setIsLoading(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const backendCollections = await listCollections(activeSiteId);
      setCollections(backendCollections);
      const nextSelected = backendCollections.find((collection) => collection.id === selectedCollectionId)
        || backendCollections.find((collection) => (
          collection.id === routeSearch.collectionId ||
          collection.slug === routeSearch.collectionId
        ))
        || backendCollections[0]
        || null;
      if (nextSelected) {
        selectCollection(nextSelected, Boolean(routeSearch.collectionId));
      } else {
        resetCollectionForm();
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load collections');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecords = async (collectionId: string) => {
    setIsRecordsLoading(true);
    setError(null);
    setValidationDetails([]);
    try {
      const result = await listCollectionRecords(activeSiteId, collectionId, {
        search: recordFilters.search.trim() || undefined,
        status: recordFilters.status || undefined,
        fieldKey: recordFilters.fieldKey || undefined,
        fieldValue: recordFilters.fieldValue.trim() || undefined,
        sortBy: recordFilters.sortBy || undefined,
        sortDirection: recordFilters.sortDirection,
        limit: recordPagination.limit,
        offset: recordPagination.offset,
      });
      setRecords(result.records);
      setSelectedRecordIds((prev) => prev.filter((id) => result.records.some((record) => record.id === id)));
      if (routeSearch.recordId) {
        const shortcutRecord = result.records.find((record) => (
          record.id === routeSearch.recordId ||
          record.slug === routeSearch.recordId
        ));
        if (shortcutRecord) {
          setSelectedRecordId(shortcutRecord.id);
        }
      }
      setRecordPagination(result.pagination);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load collection records');
      setRecords([]);
      setRecordPagination((prev) => ({
        ...prev,
        total: 0,
        hasMore: false,
      }));
    } finally {
      setIsRecordsLoading(false);
    }
  };

  const loadCollectionAuditLogs = async () => {
    setIsAuditLoading(true);
    setAuditError(null);
    try {
      const [schemaResult, recordResult] = await Promise.all([
        listAdminAuditLogs({
          siteId: activeSiteId,
          entity: 'collection',
          limit: 8,
          offset: 0,
        }),
        listAdminAuditLogs({
          siteId: activeSiteId,
          entity: 'collectionRecord',
          limit: 8,
          offset: 0,
        }),
      ]);
      setCollectionAuditLogs(
        [...schemaResult.logs, ...recordResult.logs]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 12),
      );
    } catch (loadError) {
      setCollectionAuditLogs([]);
      setAuditError(loadError instanceof Error ? loadError.message : 'Unable to load collection activity');
    } finally {
      setIsAuditLoading(false);
    }
  };

  useEffect(() => {
    void loadCollections();
    void loadCollectionAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    if (selectedCollectionId) {
      void loadRecords(selectedCollectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollectionId, activeSiteId, recordFilters.search, recordFilters.status, recordFilters.fieldKey, recordFilters.fieldValue, recordFilters.sortBy, recordFilters.sortDirection, recordPagination.limit, recordPagination.offset]);

  useEffect(() => {
    if (!selectedRecord || !activeCollection) {
      setRecordForm({ slug: '', status: 'published', values: {} });
      return;
    }

    setRecordForm({
      slug: selectedRecord.slug,
      status: selectedRecord.status,
      values: Object.fromEntries(
        activeCollection.fields.map((field) => [field.key, formatValue(selectedRecord.values[field.key])]),
      ),
    });
  }, [activeCollection, selectedRecord]);

  useEffect(() => {
    if (records.length === 0) {
      setDynamicTemplatePreviewRecordId('');
      return;
    }
    if (dynamicTemplatePreviewRecordId && records.some((record) => record.id === dynamicTemplatePreviewRecordId)) {
      return;
    }
    setDynamicTemplatePreviewRecordId(
      records.find((record) => record.status === 'published')?.id || records[0].id,
    );
  }, [dynamicTemplatePreviewRecordId, records]);

  const updateField = (index: number, updates: Partial<CollectionField>) => {
    setCollectionForm((prev) => ({
      ...prev,
      fields: prev.fields.map((field, fieldIndex) => (
        fieldIndex === index
          ? {
              ...field,
              ...updates,
              key: updates.key ? normalizeSlug(updates.key, field.key).replace(/-/g, '_') : field.key,
            }
          : field
      )),
    }));
  };

  const removeField = (index: number) => {
    setCollectionForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const updateDynamicListTemplate = (updates: Partial<CollectionDynamicTemplatesForm['list']>) => {
    setCollectionForm((prev) => ({
      ...prev,
      dynamicTemplates: {
        ...prev.dynamicTemplates,
        list: {
          ...prev.dynamicTemplates.list,
          ...updates,
        },
      },
    }));
  };

  const updateDynamicItemTemplate = (updates: Partial<CollectionDynamicTemplatesForm['item']>) => {
    setCollectionForm((prev) => ({
      ...prev,
      dynamicTemplates: {
        ...prev.dynamicTemplates,
        item: {
          ...prev.dynamicTemplates.item,
          ...updates,
        },
      },
    }));
  };

  const toggleDynamicDetailField = (fieldKey: string, checked: boolean) => {
    updateDynamicItemTemplate({
      detailFields: checked
        ? [...collectionForm.dynamicTemplates.item.detailFields, fieldKey]
        : collectionForm.dynamicTemplates.item.detailFields.filter((key) => key !== fieldKey),
    });
  };

  const updateVisitorWritePolicy = (updates: Partial<CollectionVisitorWritePolicyForm>) => {
    setCollectionForm((prev) => ({
      ...prev,
      visitorWritePolicy: {
        ...prev.visitorWritePolicy,
        ...updates,
      },
    }));
  };

  const toggleVisitorCreateField = (fieldKey: string, checked: boolean) => {
    setCollectionForm((prev) => {
      const allowedCreateFields = new Set(prev.visitorWritePolicy.allowedCreateFields);
      if (checked) {
        allowedCreateFields.add(fieldKey);
      } else {
        allowedCreateFields.delete(fieldKey);
      }

      return {
        ...prev,
        visitorWritePolicy: {
          ...prev.visitorWritePolicy,
          allowedCreateFields: Array.from(allowedCreateFields),
        },
      };
    });
  };

  const toggleVisitorUpdateField = (fieldKey: string, checked: boolean) => {
    setCollectionForm((prev) => {
      const allowedUpdateFields = new Set(prev.visitorWritePolicy.allowedUpdateFields);
      if (checked) {
        allowedUpdateFields.add(fieldKey);
      } else {
        allowedUpdateFields.delete(fieldKey);
      }

      return {
        ...prev,
        visitorWritePolicy: {
          ...prev.visitorWritePolicy,
          allowedUpdateFields: Array.from(allowedUpdateFields),
        },
      };
    });
  };

  const captureAuthoredDynamicTemplate = async (kind: 'list' | 'item') => {
    if (isCollectionsBusy) return;
    const pageId = kind === 'list'
      ? collectionForm.dynamicTemplates.list.authoredPageId
      : collectionForm.dynamicTemplates.item.authoredPageId;

    if (!pageId) {
      setError(`Choose a ${kind} template page before capturing its canvas.`);
      return;
    }

    setError(null);
    setNotice(null);

    try {
      const page = await getPage(activeSiteId, pageId);
      const authoredCanvas = authoredDynamicTemplateFromPage(page);
      if (!authoredCanvas) {
        setError(`The selected ${kind} template page has no canvas elements to capture.`);
        return;
      }

      if (kind === 'list') {
        updateDynamicListTemplate({
          authoredPageId: page.id,
          authoredPageTitle: page.title,
          authoredCapturedAt: authoredCanvas.capturedAt,
          authoredCanvas,
          authoredHistory: appendAuthoredDynamicTemplateHistory(collectionForm.dynamicTemplates.list.authoredHistory, authoredCanvas),
        });
      } else {
        updateDynamicItemTemplate({
          authoredPageId: page.id,
          authoredPageTitle: page.title,
          authoredCapturedAt: authoredCanvas.capturedAt,
          authoredCanvas,
          authoredHistory: appendAuthoredDynamicTemplateHistory(collectionForm.dynamicTemplates.item.authoredHistory, authoredCanvas),
        });
      }

      setNotice(`${kind === 'list' ? 'List' : 'Item'} template canvas captured. Save schema to publish it to dynamic routes.`);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : `Unable to capture ${kind} template page`);
    }
  };

  const clearAuthoredDynamicTemplate = (kind: 'list' | 'item') => {
    if (kind === 'list') {
      updateDynamicListTemplate({
        authoredPageId: '',
        authoredPageTitle: '',
        authoredCapturedAt: '',
        authoredCanvas: null,
      });
      return;
    }

    updateDynamicItemTemplate({
      authoredPageId: '',
      authoredPageTitle: '',
      authoredCapturedAt: '',
      authoredCanvas: null,
    });
  };

  const restoreAuthoredDynamicTemplateVersion = (
    kind: 'list' | 'item',
    version: CollectionAuthoredDynamicTemplateVersion,
  ) => {
    const restoredCanvas: CollectionAuthoredDynamicTemplate = {
      pageId: version.pageId,
      pageTitle: version.pageTitle,
      pageSlug: version.pageSlug,
      capturedAt: version.capturedAt,
      ...(version.canvasSize ? { canvasSize: version.canvasSize } : {}),
      ...(version.customCSS ? { customCSS: version.customCSS } : {}),
      elements: version.elements,
    };

    if (kind === 'list') {
      updateDynamicListTemplate({
        authoredPageId: version.pageId,
        authoredPageTitle: version.pageTitle,
        authoredCapturedAt: version.capturedAt,
        authoredCanvas: restoredCanvas,
      });
    } else {
      updateDynamicItemTemplate({
        authoredPageId: version.pageId,
        authoredPageTitle: version.pageTitle,
        authoredCapturedAt: version.capturedAt,
        authoredCanvas: restoredCanvas,
      });
    }

    setNotice(`${kind === 'list' ? 'List' : 'Item'} template restored to version ${version.version}. Save schema to publish it.`);
  };

  const handleCollectionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCollectionsBusy) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'save collection schemas');
      return;
    }

    setIsSavingCollection(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);

    const fields = collectionForm.fields
      .filter((field) => field.key.trim() && field.label.trim())
      .map((field, index) => ({
        ...field,
        key: normalizeSlug(field.key, `field_${index + 1}`).replace(/-/g, '_'),
        label: field.label.trim(),
        sortOrder: (index + 1) * 10,
      }));

    try {
      const collectionSlug = normalizeSlug(collectionForm.slug || collectionForm.name, 'collection');
      const currentMetadata = activeCollection?.metadata;
      const selectedFrontendTemplate = collectionForm.frontendDesignTemplateId
        ? frontendCollectionTemplates.find((template) => template.id === collectionForm.frontendDesignTemplateId) || null
        : null;
      const baseMetadata = collectionMetadataWithVisitorWritePolicy(
        stripFrontendCollectionTemplateMetadata(
          collectionMetadataWithDynamicTemplates(currentMetadata, collectionForm.dynamicTemplates),
        ),
        collectionForm.visitorWritePolicy,
        fields,
      );
      const metadata = selectedFrontendTemplate
        ? {
            ...baseMetadata,
            ...buildFrontendCollectionTemplateMetadata(selectedFrontendTemplate, frontendDesign),
          }
        : baseMetadata;
      const payload = {
        name: collectionForm.name.trim(),
        slug: collectionSlug,
        listRoutePattern: collectionForm.listRoutePattern.trim() || defaultCollectionListRoutePattern(collectionSlug),
        routePattern: collectionForm.routePattern.trim() || defaultCollectionRoutePattern(collectionSlug),
        description: collectionForm.description.trim() || null,
        status: collectionForm.status,
        permissions: collectionForm.permissions,
        metadata,
        fields,
      };
      const saved = selectedCollectionId
        ? await updateCollection(activeSiteId, selectedCollectionId, payload)
        : await createCollection(activeSiteId, payload);
      setCollections((prev) => {
        const exists = prev.some((collection) => collection.id === saved.id);
        return exists
          ? prev.map((collection) => (collection.id === saved.id ? saved : collection))
          : [saved, ...prev];
      });
      selectCollection(saved);
      void loadCollectionAuditLogs();
    } catch (saveError) {
      showApiError(saveError, 'Unable to save collection');
    } finally {
      setIsSavingCollection(false);
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {
    if (isCollectionsBusy) return;
    if (!canDeleteCollections) {
      showPermissionDenied('collections.delete', 'delete collection schemas');
      return;
    }

    setIsSavingCollection(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      await deleteCollection(activeSiteId, collection.id);
      const remaining = collections.filter((item) => item.id !== collection.id);
      setCollections(remaining);
      if (selectedCollectionId === collection.id) {
        const nextCollection = remaining[0] || null;
        if (nextCollection) {
          selectCollection(nextCollection);
        } else {
          resetCollectionForm();
        }
      }
      setPendingCollectionDelete(null);
      setNotice('Collection deleted.');
      void loadCollectionAuditLogs();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete collection');
    } finally {
      setIsSavingCollection(false);
    }
  };

  const handleRecordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCollection) return;
    if (isCollectionsBusy) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'save collection records');
      return;
    }

    setIsSavingRecord(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);

    try {
      const values = Object.fromEntries(
        activeCollection.fields.map((field) => [
          field.key,
          parseRecordValue(field, recordForm.values[field.key] || ''),
        ]),
      );
      const payload = {
        slug: normalizeSlug(recordForm.slug || formatValue(values.title || values.name), 'record'),
        status: recordForm.status,
        values,
      };
      const saved = selectedRecordId
        ? await updateCollectionRecord(activeSiteId, activeCollection.id, selectedRecordId, payload)
        : await createCollectionRecord(activeSiteId, activeCollection.id, payload);
      setRecords((prev) => {
        const exists = prev.some((record) => record.id === saved.id);
        return exists
          ? prev.map((record) => (record.id === saved.id ? saved : record))
          : [saved, ...prev];
      });
      setSelectedRecordId(saved.id);
      updateCollectionsRouteSearch({ recordId: saved.id });
      if (activeCollection) {
        void loadRecords(activeCollection.id);
      }
      void loadCollectionAuditLogs();
    } catch (saveError) {
      showApiError(saveError, 'Unable to save collection record');
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (record: CollectionRecord) => {
    if (!activeCollection) {
      return;
    }
    if (isCollectionsBusy) return;
    if (!canDeleteCollections) {
      showPermissionDenied('collections.delete', 'delete collection records');
      return;
    }

    setIsSavingRecord(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      await deleteCollectionRecord(activeSiteId, activeCollection.id, record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      if (selectedRecordId === record.id) {
        setSelectedRecordId(null);
        updateCollectionsRouteSearch({ recordId: undefined });
      }
      setPendingRecordDelete(null);
      setNotice('Collection record deleted.');
      void loadRecords(activeCollection.id);
      void loadCollectionAuditLogs();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete collection record');
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleBulkUpdateStatus = async (status: CollectionRecord['status']) => {
    if (!activeCollection || selectedRecordIds.length === 0) return;
    if (isCollectionsBusy) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'bulk update collection records');
      return;
    }

    setIsSavingRecord(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const result = await bulkUpdateCollectionRecords(activeSiteId, activeCollection.id, {
        action: 'updateStatus',
        recordIds: selectedRecordIds,
        status,
      });
      setRecords((prev) => prev.map((record) => (
        result.records.find((updatedRecord) => updatedRecord.id === record.id) || record
      )));
      setSelectedRecordIds([]);
      setNotice(`${result.updated} records moved to ${status}${result.skipped ? `, ${result.skipped} skipped` : ''}.`);
      void loadRecords(activeCollection.id);
      void loadCollectionAuditLogs();
    } catch (bulkError) {
      showApiError(bulkError, 'Unable to update selected collection records');
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleBulkDeleteRecords = async () => {
    if (!activeCollection || selectedRecordIds.length === 0) return;
    if (isCollectionsBusy) return;
    if (!canDeleteCollections) {
      showPermissionDenied('collections.delete', 'bulk delete collection records');
      return;
    }

    setIsSavingRecord(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const deletedIds = selectedRecordIds;
      const result = await bulkUpdateCollectionRecords(activeSiteId, activeCollection.id, {
        action: 'delete',
        recordIds: deletedIds,
      });
      setRecords((prev) => prev.filter((record) => !deletedIds.includes(record.id)));
      if (selectedRecordId && deletedIds.includes(selectedRecordId)) {
        setSelectedRecordId(null);
        updateCollectionsRouteSearch({ recordId: undefined });
      }
      setSelectedRecordIds([]);
      setPendingBulkDelete(false);
      setNotice(`${result.deleted} records deleted${result.skipped ? `, ${result.skipped} skipped` : ''}.`);
      void loadRecords(activeCollection.id);
      void loadCollectionAuditLogs();
    } catch (bulkError) {
      showApiError(bulkError, 'Unable to delete selected collection records');
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleExportRecords = async () => {
    if (!activeCollection) return;
    if (isCollectionsBusy) return;
    if (!canExportCollections) {
      showPermissionDenied('collections.export', 'export collection records');
      return;
    }

    setIsExportingRecords(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const blob = await exportCollectionRecordsCsv(activeSiteId, activeCollection.id, {
        search: recordFilters.search.trim() || undefined,
        status: recordFilters.status || undefined,
        fieldKey: recordFilters.fieldKey || undefined,
        fieldValue: recordFilters.fieldValue.trim() || undefined,
        sortBy: recordFilters.sortBy || undefined,
        sortDirection: recordFilters.sortDirection,
        limit: 1000,
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${activeCollection.slug}-records.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice('Collection records CSV exported.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export collection records');
    } finally {
      setIsExportingRecords(false);
    }
  };

  const handleImportRecords = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeCollection) return;
    if (isCollectionsBusy) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'import collection records');
      event.target.value = '';
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingRecords(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const csv = await file.text();
      const result = await importCollectionRecordsCsv(activeSiteId, activeCollection.id, csv, { upsert: true });
      setNotice(`${result.created} created, ${result.updated} updated, ${result.skipped} skipped from ${file.name}.`);
      if (result.errors.length > 0) {
        const firstError = result.errors[0];
        setError(`Row ${firstError.row} skipped: ${firstError.message}`);
        setValidationDetails(formatValidationDetails(firstError.details));
      }
      await loadRecords(activeCollection.id);
    } catch (importError) {
      showApiError(importError, 'Unable to import collection records');
    } finally {
      setIsImportingRecords(false);
      event.target.value = '';
    }
  };

  const dynamicTemplateFields = collectionForm.fields
    .filter((field) => field.key.trim() && field.label.trim())
    .map((field, index) => ({
      ...field,
      key: normalizeSlug(field.key, `field_${index + 1}`).replace(/-/g, '_'),
      label: field.label.trim(),
      sortOrder: field.sortOrder || (index + 1) * 10,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const dynamicTemplateMediaFields = dynamicTemplateFields.filter((field) => MEDIA_FIELD_TYPES.includes(field.type));
  const dynamicTemplateImageFields = dynamicTemplateMediaFields.length > 0 ? dynamicTemplateMediaFields : dynamicTemplateFields;
  const dynamicListRoutePreview = normalizeCollectionListRoutePattern(
    collectionForm.listRoutePattern,
    collectionForm.slug || 'collection',
  );
  const dynamicItemRoutePreview = normalizeCollectionRoutePattern(
    collectionForm.routePattern,
    collectionForm.slug || 'collection',
  ).replace(':recordSlug', '{recordSlug}');
  const selectedFrontendCollectionTemplate = collectionForm.frontendDesignTemplateId
    ? frontendCollectionTemplates.find((template) => template.id === collectionForm.frontendDesignTemplateId) || null
    : null;

  return (
    <PageShell
      title="Collections"
      description="Build structured CMS data for custom frontends and dynamic Backy pages."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadCollections()}
            disabled={isCollectionsBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Refresh collections"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={beginNewCollection}
            disabled={schemaMutationDisabled}
            title={editPermissionTitle}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Create new collection"
            data-testid="collections-new-collection-button"
          >
            <Plus className="h-4 w-4" />
            New collection
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>{error}</div>
          {validationDetails.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationDetails.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {!canViewCollections && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {viewPermissionTitle}
        </div>
      )}

      <section className="mb-5 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="collections-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Collections command center</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                collectionReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
              >
                {collectionReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control reusable structured data for custom frontends: schemas, records, permissions, imports, exports, routes, and public API delivery.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyCollectionApiText(collectionHandoffText, 'Collections handoff manifest')}
              disabled={isCollectionsBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              Copy manifest
            </button>
            <button
              type="button"
              onClick={downloadCollectionHandoff}
              disabled={isCollectionsBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={downloadCollectionSchemaCsv}
              disabled={collections.length === 0 || isCollectionsBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export schemas
            </button>
            <button
              type="button"
              onClick={() => void loadCollections()}
              disabled={isCollectionsBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={beginNewCollection}
              disabled={schemaMutationDisabled}
              title={editPermissionTitle}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="collections-library-new-collection-button"
            >
              <Plus className="h-4 w-4" />
              New collection
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Collection readiness</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Checks the active schema, public routes, field integrity, permissions, and visitor-write posture.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {activeCollection?.name || 'Draft schema'}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${collectionReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${collectionReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {collectionReadiness.checks.map((check) => (
                <CollectionReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Data workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {collectionWorkflow.map((step, index) => (
                <CollectionWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Collections control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to site scope, API delivery, schema library, builder, and record operations.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {COLLECTION_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Connected data workflows</h3>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Collections become useful when records can power pages, media-backed fields, commerce objects, public form writes, site routes, and runtime API delivery.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {COLLECTION_WORKFLOW_SURFACES.length} surfaces
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            {COLLECTION_WORKFLOW_SURFACES.map((surface) => (
              <button
                key={surface.key}
                type="button"
                onClick={() => openCollectionWorkflowSurface(surface)}
                disabled={isCollectionsBusy}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="collections-audit" className="mb-5 rounded-lg border border-border bg-card p-4 scroll-mt-24" data-testid="collections-audit-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" />
              Collections access and activity
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Permission keys for collection operations plus request-id-backed schema and record create, update, bulk status, and delete audit events.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCollectionAuditLogs()}
            disabled={isAuditLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isAuditLoading ? 'animate-spin' : ''}`} />
            Refresh activity
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-lg border border-border bg-background p-4" data-testid="collections-permission-contract">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Permission contract</h3>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Effective role {permissionMatrix?.role || currentAdmin?.role || 'unknown'}
              </span>
            </div>
            {permissionError && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {permissionError}
              </div>
            )}
            <div className="mt-3 grid gap-2">
              {COLLECTION_PERMISSION_CONTRACT.map((permission) => {
                const allowed = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, permission.key);
                const pending = isPermissionsLoading && !permissionMatrix;

                return (
                  <div key={permission.key} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{permission.label}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          pending
                            ? 'bg-muted text-muted-foreground'
                            : allowed
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700',
                        )}
                        >
                          {pending ? 'Loading' : allowed ? 'Allowed' : 'Blocked'}
                        </span>
                        <code className="rounded bg-muted px-2 py-1 text-xs">{permission.key}</code>
                      </div>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{permission.detail}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {pending ? 'Loading current admin permission matrix.' : collectionPermissionReason(permissionMatrix, currentAdmin, permission.key)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Recent collection activity</h3>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {collectionAuditLogs.length} shown
              </span>
            </div>
            {auditError && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {auditError}
              </div>
            )}
            <div className="mt-3 grid gap-2" data-testid="collections-audit-list">
              {isAuditLoading ? (
                <div className="rounded-lg border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                  Loading collection activity...
                </div>
              ) : collectionAuditLogs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                  No collection or record audit events recorded yet.
                </div>
              ) : (
                collectionAuditLogs.map((log) => (
                  <CollectionAuditLogCard key={log.id} log={log} />
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-lg border border-border bg-card p-4" data-testid="collections-templates">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Collection templates</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Start common dynamic data models without building every field from scratch. Templates load into the schema builder and still require saving.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {COLLECTION_TEMPLATES.length} starters
          </span>
        </div>

        {(frontendCollectionTemplates.length > 0 || frontendDesignLoading || frontendDesignError) && (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/50 p-4" data-testid="collections-frontend-template-options">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-teal-700" />
                  <h3 className="text-sm font-semibold text-foreground">Frontend design collections</h3>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Create dynamic datasets from the connected frontend contract while preserving source, chrome, tokens, route patterns, and data-binding hints.
                </p>
              </div>
              <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-teal-700">
                {frontendDesign?.source.label || frontendDesign?.source.type || 'Frontend contract'}
              </span>
            </div>
            {frontendDesignLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="size-3.5 animate-spin" />
                Loading captured collection templates...
              </div>
            ) : null}
            {frontendDesignError ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                {frontendDesignError}
              </div>
            ) : null}
            {frontendCollectionTemplateBlueprints.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {frontendCollectionTemplateBlueprints.map(({ template, blueprint }) => {
                  const metadata = collectionMetadataWithDynamicTemplates(
                    buildFrontendCollectionTemplateMetadata(template, frontendDesign),
                    defaultDynamicTemplates(),
                  );
                  const manifestText = JSON.stringify({
                    schemaVersion: 'backy.frontend-collection-template.v1',
                    template,
                    collection: {
                      ...blueprint,
                      fields: blueprint.fields,
                      metadata,
                    },
                  }, null, 2);

                  return (
                    <article key={template.id} className="rounded-lg border border-teal-200 bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{template.name}</h4>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description || blueprint.description}</p>
                        </div>
                        <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700">
                          {blueprint.fields.length} fields
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{blueprint.listRoutePattern}</span>
                        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{template.bindingHints?.length || 0} bindings</span>
                        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          {blueprint.permissions.publicCreate ? 'public create' : 'admin write'}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2">
                        {blueprint.fields.slice(0, 4).map((field) => (
                          <div key={field.key} className="flex items-center justify-between gap-3 rounded border border-border bg-muted/40 px-2.5 py-2">
                            <span className="truncate text-xs font-medium text-foreground">{field.label}</span>
                            <span className="shrink-0 rounded bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{field.type}</span>
                          </div>
                        ))}
                        {blueprint.fields.length > 4 ? (
                          <div className="text-xs text-muted-foreground">+{blueprint.fields.length - 4} more field{blueprint.fields.length - 4 === 1 ? '' : 's'}</div>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void createCollectionFromFrontendTemplate(template, blueprint)}
                          disabled={schemaMutationDisabled}
                          title={editPermissionTitle}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid={`collections-frontend-template-${template.id}`}
                        >
                          <Database className="h-4 w-4" />
                          {isCreatingFrontendTemplateId === template.id ? 'Creating...' : 'Create collection'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyCollectionApiText(manifestText, `${template.name} frontend collection template`)}
                          disabled={isCollectionsBusy}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Copy className="h-4 w-4" />
                          Copy schema
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : !frontendDesignLoading && !frontendDesignError ? (
              <p className="mt-3 text-xs text-muted-foreground">The current frontend contract has no collection templates yet.</p>
            ) : null}
          </div>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {COLLECTION_TEMPLATES.map((template) => (
            <article key={template.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.useCase}</p>
                </div>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  /{template.slug}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-md border border-border px-2 py-1">{template.fields.length} fields</span>
                <span className="rounded-md border border-border px-2 py-1">
                  {template.permissions.publicRead ? 'public read' : 'admin only'}
                </span>
                {template.fields.some((field) => MEDIA_FIELD_TYPES.includes(field.type)) && (
                  <span className="rounded-md border border-border px-2 py-1">media-ready</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => applyCollectionTemplate(template)}
                disabled={schemaMutationDisabled}
                title={editPermissionTitle}
                className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use template
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {collectionMetrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </div>

      <section id="collections-api" className="mb-5 rounded-lg border border-border bg-card scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Collection API contract</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Public endpoints for storefronts plus private admin endpoints for schema, records, import, and bulk workflows.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyCollectionApiText(recordsCopyUrl, recordsCopyLabel)}
            disabled={isCollectionsBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Copy ${activeCollectionIsPublic ? 'public' : 'admin'} records URL`}
          >
            <Copy className="h-4 w-4" />
            {activeCollectionIsPublic ? 'Copy public records' : 'Copy admin records'}
          </button>
          <button
            type="button"
            onClick={() => void copyCollectionApiText(collectionHandoffText, 'Collections handoff manifest')}
            disabled={isCollectionsBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            Copy manifest
          </button>
          <button
            type="button"
            onClick={downloadCollectionSchemaCsv}
            disabled={collections.length === 0 || isCollectionsBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Export schemas
          </button>
        </div>
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <CollectionApiStat label="Active collection" value={activeCollection?.name || 'No collection'} />
            <CollectionApiStat label="Public read" value={activeCollection?.permissions?.publicRead ? 'enabled' : 'off'} />
            <CollectionApiStat label="Visitor create" value={activeCollection?.permissions?.publicCreate ? 'enabled' : 'off'} />
            <CollectionApiStat label="Fields" value={`${activeCollection?.fields.length || collectionForm.fields.length}`} />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Frontend readiness</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Checks the schema, routes, public delivery, field integrity, and visitor-write posture.
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  collectionReadiness.score >= 80
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
                >
                  {collectionReadiness.score}% ready
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    collectionReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${collectionReadiness.score}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {collectionReadiness.checks.map((check) => (
                  <CollectionReadinessCheck key={check.label} {...check} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Frontend wiring</h3>
              </div>
              <div className="mt-3 space-y-3">
                <CollectionRoutePreview label="List page" value={activeListRoutePath} />
                <CollectionRoutePreview label="Item page" value={activeItemRoutePath} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <CollectionApiStat label="Required" value={`${fieldHealth.required}`} />
                <CollectionApiStat label="Unique" value={`${fieldHealth.unique}`} />
                <CollectionApiStat label="Relations" value={`${fieldHealth.relational}`} />
                <CollectionApiStat label="Media" value={`${fieldHealth.media}`} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                These field groups are what the visual page/editor layer can bind into lists, detail pages, forms, and commerce-like catalog surfaces.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Dynamic data frontend contract</h3>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Collections define reusable object models that any page, storefront, directory, portfolio, or custom frontend can consume without hardcoded field assumptions.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {COLLECTION_FRONTEND_SYSTEMS.length} systems
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {COLLECTION_FRONTEND_SYSTEMS.map((system) => (
                <div key={system.key} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{system.title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{system.detail}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {system.key}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="collections-binding-contract">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Editor data-binding contract</h3>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Use collection schemas as reusable datasets for page repeaters, detail routes, filters, field-level component bindings, public write flows, and media-backed records.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {COLLECTION_BINDING_TARGETS.length} targets
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {COLLECTION_BINDING_TARGETS.map((target) => (
                <div key={target.key} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{target.title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{target.detail}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {target.key}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {activeCollection && datasetAuthoringShortcuts && (
            <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50/40 p-4" data-testid="collections-authoring-shortcuts">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-cyan-700" />
                    <h3 className="text-sm font-semibold text-cyan-950">Dataset authoring shortcuts</h3>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-cyan-900/80">
                    Copy ready-to-bind dataset presets for repeaters, detail fields, and generated page briefs before opening the page builder.
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 font-mono text-xs font-medium text-cyan-900" data-testid="collections-authoring-dataset-id">
                  {datasetAuthoringShortcuts.datasetId}
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.repeaterPresetText, 'Repeater dataset preset')}
                    disabled={isCollectionsBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-authoring-copy-repeater"
                  >
                    <Copy className="h-4 w-4" />
                    Copy repeater preset
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.fieldBindingPresetText, 'Field binding preset')}
                    disabled={isCollectionsBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-authoring-copy-binding"
                  >
                    <Copy className="h-4 w-4" />
                    Copy field binding
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.listPageBriefText, 'List page dataset brief')}
                    disabled={isCollectionsBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-authoring-copy-list-brief"
                  >
                    <Copy className="h-4 w-4" />
                    Copy list page brief
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.itemPageBriefText, 'Item page dataset brief')}
                    disabled={isCollectionsBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-authoring-copy-item-brief"
                  >
                    <Copy className="h-4 w-4" />
                    Copy item page brief
                  </button>
                  <button
                    type="button"
                    onClick={() => openDatasetPageBuilder('list')}
                    disabled={isCollectionsBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-authoring-open-list-builder"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open list builder
                  </button>
                  <button
                    type="button"
                    onClick={() => openDatasetPageBuilder('item')}
                    disabled={isCollectionsBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-authoring-open-item-builder"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open item builder
                  </button>
                </div>

                <div className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs text-cyan-950" data-testid="collections-authoring-summary">
                  <div className="grid gap-2">
                    <CollectionApiStat label="Title" value={datasetAuthoringShortcuts.titleField?.key || 'Unmapped'} />
                    <CollectionApiStat label="Summary" value={datasetAuthoringShortcuts.descriptionField?.key || 'Unmapped'} />
                    <CollectionApiStat label="Media" value={datasetAuthoringShortcuts.imageField?.key || 'Unmapped'} />
                    <CollectionApiStat label="Filters" value={`${datasetAuthoringShortcuts.filterFields.length}`} />
                  </div>
                  <div className="mt-3 space-y-1 font-mono text-[11px] leading-5 text-cyan-900/80">
                    <div>{activeListRoutePath}</div>
                    <div>{activeItemRoutePath}</div>
                    <div>{datasetAuthoringShortcuts.pagesCreateRoute}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <CollectionApiSnippet label="Public collections" value={publicCollectionsUrl} />
            <CollectionApiSnippet label="Public records" value={publicRecordsUrl} />
            <CollectionApiSnippet label="Public record by slug" value={publicRecordBySlugUrl} />
            <CollectionApiSnippet label="Admin collections" value={adminCollectionsUrl} />
            <CollectionApiSnippet label="Admin records" value={adminRecordsUrl} />
            <CollectionApiSnippet label="CSV import" value={adminImportUrl} />
            <CollectionApiSnippet label="Bulk records" value={adminBulkUrl} />
          </div>
        </div>
      </section>

      <div id="collections-site" className="mb-5 flex flex-wrap items-center gap-3 scroll-mt-24">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="collection-site">
          Site
        </label>
        <select
          id="collection-site"
          value={activeSiteId}
          disabled={isCollectionsBusy}
          onChange={(event) => selectCollectionsSite(event.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sites.map((site) => (
            <option key={site.id} value={site.publicSiteId || site.id}>
              {site.name}
            </option>
          ))}
        </select>
        {isLoading && <span className="text-sm text-muted-foreground">Loading collections...</span>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section id="collections-library" className="self-start rounded-lg border border-border bg-card scroll-mt-24">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Collection library</h2>
          </div>
          <div className="divide-y divide-border">
            {collections.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Database className="mx-auto mb-3 h-8 w-8" />
                No collections
              </div>
            ) : collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                disabled={isCollectionsBusy}
                onClick={() => selectCollection(collection)}
                className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 ${
                  collection.id === selectedCollectionId ? 'bg-primary/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">{collection.name}</div>
                    <div className="text-xs text-muted-foreground">/{collection.slug}</div>
                  </div>
                  <StatusBadge status={collection.status} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {collection.fields.length} fields
                  {' '}
                  {'/ '}
                  {collection.permissions.publicRead ? 'public API' : 'admin only'}
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card" data-testid="collections-relationship-browser">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Relationship browser</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Inspect outgoing reference fields, incoming reverse references, unmapped relationship fields, and route targets before using this schema in repeaters or dynamic pages.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {relationshipBrowser.relatedCollectionIds.length} linked schema{relationshipBrowser.relatedCollectionIds.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(220px,280px)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outgoing references</h3>
                  <span className="text-xs text-muted-foreground" data-testid="collections-relationship-outgoing-count">
                    {relationshipBrowser.outgoing.length} field{relationshipBrowser.outgoing.length === 1 ? '' : 's'}
                  </span>
                </div>
                {relationshipBrowser.outgoing.length > 0 ? (
                  <div className="space-y-2" data-testid="collections-relationship-outgoing">
                    {relationshipBrowser.outgoing.map(({ field, target, route }) => (
                      <div
                        key={`${field.key}-${target?.id || 'missing'}`}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm',
                          target ? 'border-border bg-background' : 'border-amber-200 bg-amber-50 text-amber-950',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {field.label || field.key}
                              <span className="ml-1 font-mono text-xs text-muted-foreground">({field.key})</span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {field.type} to {target ? target.name : 'unmapped target'}
                            </div>
                            {target && (
                              <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{route}</div>
                            )}
                          </div>
                          {target ? (
                            <button
                              type="button"
                              onClick={() => selectCollection(target)}
                              disabled={isCollectionsBusy}
                              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Open
                            </button>
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground" data-testid="collections-relationship-outgoing-empty">
                    Add a reference or multi-reference field to connect this schema to another collection.
                  </div>
                )}
              </div>

              <div className="flex min-h-36 flex-col justify-center rounded-xl border border-primary/20 bg-primary/5 p-4 text-center" data-testid="collections-relationship-active-node">
                <Database className="mx-auto mb-2 h-8 w-8 text-primary" aria-hidden="true" />
                <div className="text-sm font-semibold text-foreground">{relationshipBrowser.activeName}</div>
                <div className="mt-1 truncate font-mono text-xs text-muted-foreground">/{relationshipBrowser.activeSlug}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-background px-2 py-1">
                    {activeSchemaFields.length} fields
                  </div>
                  <div className="rounded-md bg-background px-2 py-1">
                    {fieldHealth.relational} relation{fieldHealth.relational === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Incoming references</h3>
                  <span className="text-xs text-muted-foreground" data-testid="collections-relationship-incoming-count">
                    {relationshipBrowser.incoming.length} field{relationshipBrowser.incoming.length === 1 ? '' : 's'}
                  </span>
                </div>
                {relationshipBrowser.incoming.length > 0 ? (
                  <div className="space-y-2" data-testid="collections-relationship-incoming">
                    {relationshipBrowser.incoming.map(({ collection, field, route }) => (
                      <div key={`${collection.id}-${field.key}`} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {collection.name}
                              <span className="ml-1 font-mono text-xs text-muted-foreground">/{collection.slug}</span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {field.label || field.key} ({field.type})
                            </div>
                            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{route}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => selectCollection(collection)}
                            disabled={isCollectionsBusy}
                            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground" data-testid="collections-relationship-incoming-empty">
                    No saved collections currently point at this schema.
                  </div>
                )}
              </div>
            </div>

            {relationshipBrowser.unmapped.length > 0 && (
              <div className="border-t border-border px-4 py-3" data-testid="collections-relationship-unmapped">
                <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span className="font-medium">Unmapped relationship fields:</span>
                  {relationshipBrowser.unmapped.slice(0, 6).map(({ collection, field }) => (
                    <button
                      key={`${collection.id}-${field.key}`}
                      type="button"
                      onClick={() => selectCollection(collection)}
                      disabled={isCollectionsBusy}
                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {collection.name}.{field.key}
                    </button>
                  ))}
                  {relationshipBrowser.unmapped.length > 6 && (
                    <span className="text-muted-foreground">+{relationshipBrowser.unmapped.length - 6} more</span>
                  )}
                </div>
              </div>
            )}
          </section>

          <form id="collections-schema" onSubmit={handleCollectionSubmit} className="rounded-lg border border-border bg-card scroll-mt-24">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Schema builder</h2>
              <div className="flex items-center gap-2">
                {activeCollection && (
                  <button
                    type="button"
                    onClick={() => {
                      if (destructiveActionDisabled) return;
                      setPendingCollectionDelete(activeCollection);
                    }}
                    disabled={destructiveActionDisabled}
                    title={deletePermissionTitle}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
                <button
                  type="submit"
                  disabled={schemaMutationDisabled}
                  title={editPermissionTitle}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {isSavingCollection ? 'Saving...' : 'Save schema'}
                </button>
              </div>
            </div>

            <fieldset disabled={schemaMutationDisabled} className="min-w-0">
            <div className="grid gap-4 p-4 lg:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Name</span>
                <input
                  id="collections-schema-name"
                  value={collectionForm.name}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                    slug: prev.slug || normalizeSlug(event.target.value, 'collection'),
                  }))}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Slug</span>
                <input
                  value={collectionForm.slug}
                  onChange={(event) => setCollectionForm((prev) => {
                    const nextSlug = normalizeSlug(event.target.value, 'collection');
                    const previousDefault = defaultCollectionRoutePattern(prev.slug);
                    const previousListDefault = defaultCollectionListRoutePattern(prev.slug);
                    return {
                      ...prev,
                      slug: nextSlug,
                      listRoutePattern: !prev.listRoutePattern || prev.listRoutePattern === previousListDefault
                        ? defaultCollectionListRoutePattern(nextSlug)
                        : prev.listRoutePattern,
                      routePattern: !prev.routePattern || prev.routePattern === previousDefault
                        ? defaultCollectionRoutePattern(nextSlug)
                        : prev.routePattern,
                    };
                  })}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">List route</span>
                <input
                  value={collectionForm.listRoutePattern}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    listRoutePattern: event.target.value,
                  }))}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  placeholder={defaultCollectionListRoutePattern(collectionForm.slug)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Item route</span>
                <input
                  value={collectionForm.routePattern}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    routePattern: event.target.value,
                  }))}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  placeholder={defaultCollectionRoutePattern(collectionForm.slug)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Status</span>
                <select
                  value={collectionForm.status}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    status: event.target.value as Collection['status'],
                  }))}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <div className="space-y-2 pt-1 text-sm lg:col-span-3">
                <span className="font-medium">Delivery permissions</span>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <PermissionSwitch
                    label="Public read"
                    description="Frontend pages can list and render records."
                    checked={collectionForm.permissions.publicRead}
                    disabled={schemaMutationDisabled}
                    testId="collections-public-read-toggle"
                    onChange={(checked) => setCollectionForm((prev) => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        publicRead: checked,
                      },
                    }))}
                  />
                  <PermissionSwitch
                    label="Visitor create"
                    description="Public POST creates draft records."
                    checked={collectionForm.permissions.publicCreate}
                    disabled={schemaMutationDisabled}
                    testId="collections-public-create-toggle"
                    onChange={(checked) => setCollectionForm((prev) => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        publicCreate: checked,
                      },
                    }))}
                  />
                  <PermissionSwitch
                    label="Visitor update"
                    description="Public PATCH requires the write token below."
                    checked={collectionForm.permissions.publicUpdate}
                    disabled={schemaMutationDisabled}
                    testId="collections-public-update-toggle"
                    onChange={(checked) => setCollectionForm((prev) => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        publicUpdate: checked,
                      },
                    }))}
                  />
                  <PermissionSwitch
                    label="Visitor delete"
                    description="Public DELETE requires the write token below."
                    checked={collectionForm.permissions.publicDelete}
                    disabled={schemaMutationDisabled}
                    testId="collections-public-delete-toggle"
                    onChange={(checked) => setCollectionForm((prev) => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        publicDelete: checked,
                      },
                    }))}
                  />
                </div>
                <div
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3"
                  data-testid="collections-visitor-write-policy"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-medium text-amber-950">Visitor create field policy</div>
                      <p className="mt-1 text-xs leading-5 text-amber-900/80">
                        Restrict which schema fields public record creation may write before validation and moderation.
                      </p>
                    </div>
                    <select
                      value={collectionForm.visitorWritePolicy.createFieldMode}
                      onChange={(event) => updateVisitorWritePolicy({
                        createFieldMode: event.target.value === 'selected' ? 'selected' : 'all',
                      })}
                      disabled={schemaMutationDisabled}
                      className="rounded-lg border bg-background px-3 py-2 text-xs"
                      data-testid="collections-visitor-write-policy-mode"
                    >
                      <option value="all">Allow all fields</option>
                      <option value="selected">Only selected fields</option>
                    </select>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {collectionForm.fields
                      .filter((field) => field.key.trim() && field.label.trim())
                      .map((field) => (
                        <label
                          key={field.id || field.key}
                          className={cn(
                            'flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-xs',
                            collectionForm.visitorWritePolicy.createFieldMode === 'selected' &&
                              collectionForm.visitorWritePolicy.allowedCreateFields.includes(field.key)
                              ? 'border-amber-400'
                              : 'border-amber-100',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={collectionForm.visitorWritePolicy.allowedCreateFields.includes(field.key)}
                            disabled={schemaMutationDisabled || collectionForm.visitorWritePolicy.createFieldMode !== 'selected'}
                            onChange={(event) => toggleVisitorCreateField(field.key, event.target.checked)}
                            data-testid={`collections-visitor-write-field-${field.key}`}
                          />
                          <span>
                            <span className="font-medium text-amber-950">{field.label}</span>
                            <span className="block text-amber-900/70">{field.key}</span>
                          </span>
                        </label>
                      ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateVisitorWritePolicy({
                        createFieldMode: 'selected',
                        allowedCreateFields: collectionForm.fields
                          .map((field) => field.key)
                          .filter(Boolean),
                      })}
                      disabled={schemaMutationDisabled}
                      className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => updateVisitorWritePolicy({ createFieldMode: 'selected', allowedCreateFields: [] })}
                      disabled={schemaMutationDisabled}
                      className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear selected
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-amber-900/80">
                    {collectionForm.visitorWritePolicy.createFieldMode === 'selected'
                      ? `${collectionForm.visitorWritePolicy.allowedCreateFields.length} fields writable from public POST. Other submitted values are ignored.`
                      : 'Public POST may write any schema field, then records stay draft for moderation.'}
                  </p>
                </div>
                <div
                  className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3"
                  data-testid="collections-visitor-mutation-policy"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                    <div>
                      <div className="font-medium text-rose-950">Visitor update/delete policy</div>
                      <p className="mt-1 text-xs leading-5 text-rose-900/80">
                        Public PATCH and DELETE require a collection-scoped write token. Update requests may also be limited to selected fields.
                      </p>
                    </div>
                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-rose-950">Public write token</span>
                      <input
                        type="password"
                        value={collectionForm.visitorWritePolicy.publicWriteToken}
                        onChange={(event) => updateVisitorWritePolicy({ publicWriteToken: event.target.value })}
                        disabled={schemaMutationDisabled}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                        placeholder="Required for public update/delete"
                        data-testid="collections-visitor-write-token"
                      />
                      <span className="block text-rose-900/70">
                        Sent by custom frontends as `x-backy-public-write-token` or `publicWriteToken`.
                      </span>
                    </label>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-xs text-rose-900/80">
                      {collectionForm.permissions.publicUpdate || collectionForm.permissions.publicDelete
                        ? collectionForm.visitorWritePolicy.publicWriteToken.trim()
                          ? 'Token configured for enabled public mutation routes.'
                          : 'Set a token before using public update/delete from a frontend.'
                        : 'Enable visitor update or delete above to expose public mutation routes.'}
                    </div>
                    <select
                      value={collectionForm.visitorWritePolicy.updateFieldMode}
                      onChange={(event) => updateVisitorWritePolicy({
                        updateFieldMode: event.target.value === 'selected' ? 'selected' : 'all',
                      })}
                      disabled={schemaMutationDisabled}
                      className="rounded-lg border bg-background px-3 py-2 text-xs"
                      data-testid="collections-visitor-update-policy-mode"
                    >
                      <option value="all">Allow all update fields</option>
                      <option value="selected">Only selected update fields</option>
                    </select>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {collectionForm.fields
                      .filter((field) => field.key.trim() && field.label.trim())
                      .map((field) => (
                        <label
                          key={`update-${field.id || field.key}`}
                          className={cn(
                            'flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-xs',
                            collectionForm.visitorWritePolicy.updateFieldMode === 'selected' &&
                              collectionForm.visitorWritePolicy.allowedUpdateFields.includes(field.key)
                              ? 'border-rose-400'
                              : 'border-rose-100',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={collectionForm.visitorWritePolicy.allowedUpdateFields.includes(field.key)}
                            disabled={schemaMutationDisabled || collectionForm.visitorWritePolicy.updateFieldMode !== 'selected'}
                            onChange={(event) => toggleVisitorUpdateField(field.key, event.target.checked)}
                            data-testid={`collections-visitor-update-field-${field.key}`}
                          />
                          <span>
                            <span className="font-medium text-rose-950">{field.label}</span>
                            <span className="block text-rose-900/70">{field.key}</span>
                          </span>
                        </label>
                      ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateVisitorWritePolicy({
                        updateFieldMode: 'selected',
                        allowedUpdateFields: collectionForm.fields
                          .map((field) => field.key)
                          .filter(Boolean),
                      })}
                      disabled={schemaMutationDisabled}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-950 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Select update fields
                    </button>
                    <button
                      type="button"
                      onClick={() => updateVisitorWritePolicy({ updateFieldMode: 'selected', allowedUpdateFields: [] })}
                      disabled={schemaMutationDisabled}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-950 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear update fields
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-rose-900/80">
                    {collectionForm.visitorWritePolicy.updateFieldMode === 'selected'
                      ? `${collectionForm.visitorWritePolicy.allowedUpdateFields.length} fields writable from public PATCH. Other submitted values are ignored.`
                      : 'Public PATCH may write any schema field after token validation.'}
                  </p>
                </div>
              </div>
              <label className="space-y-1 text-sm lg:col-span-4">
                <span className="font-medium">Description</span>
                <textarea
                  value={collectionForm.description}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))}
                  className="min-h-20 w-full rounded-lg border bg-background px-3 py-2"
                />
              </label>
            </div>

            <div className="border-t border-border px-4 py-4" data-testid="collections-dynamic-template-controls">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Dynamic list and item templates</h3>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Save generated-route layout presets and field roles for public collection pages that do not use a captured frontend design template.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  <div>List {dynamicListRoutePreview}</div>
                  <div>Item {dynamicItemRoutePreview}</div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="collections-frontend-template-control">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Captured frontend template</h4>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                      Attach a captured collection template from the connected frontend design contract. When selected, public list/item routes use the captured canvas before falling back to generated templates.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {frontendCollectionTemplates.length} available
                  </span>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)]">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Template source</span>
                    <select
                      value={collectionForm.frontendDesignTemplateId}
                      onChange={(event) => setCollectionForm((prev) => ({
                        ...prev,
                        frontendDesignTemplateId: event.target.value,
                      }))}
                      className="w-full rounded-lg border bg-background px-3 py-2"
                      data-testid="collections-frontend-template-select"
                    >
                      <option value="">Use generated Backy templates</option>
                      {frontendCollectionTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name || template.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" data-testid="collections-frontend-template-summary">
                    {selectedFrontendCollectionTemplate ? (
                      <>
                        <div className="font-medium text-foreground">{selectedFrontendCollectionTemplate.name || selectedFrontendCollectionTemplate.id}</div>
                        <div className="mt-1 font-mono">{selectedFrontendCollectionTemplate.id}</div>
                        {selectedFrontendCollectionTemplate.routePattern && (
                          <div className="mt-1 font-mono">{selectedFrontendCollectionTemplate.routePattern}</div>
                        )}
                        {(selectedFrontendCollectionTemplate.bindingHints || []).length > 0 && (
                          <div className="mt-1">{(selectedFrontendCollectionTemplate.bindingHints || []).length} binding hints</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-foreground">Generated route templates</div>
                        <div className="mt-1">Backy uses the list/item controls below until a captured frontend template is attached.</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4" data-testid="collections-template-preview-controls">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-950">Template preview record</h4>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-indigo-900/80">
                      Pick a real record to resolve the item route and render API previews for generated, captured, or authored dynamic templates.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-indigo-900">
                    {dynamicTemplatePreviewRecord ? dynamicTemplatePreviewRecord.status : 'No record'}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-indigo-950">Preview record</span>
                    <select
                      value={dynamicTemplatePreviewRecord?.id || ''}
                      onChange={(event) => setDynamicTemplatePreviewRecordId(event.target.value)}
                      disabled={records.length === 0}
                      className="w-full rounded-lg border bg-background px-3 py-2"
                      data-testid="collections-template-preview-record-select"
                    >
                      {records.length === 0 ? (
                        <option value="">Create or load records first</option>
                      ) : records.map((record) => (
                        <option key={record.id} value={record.id}>
                          {record.slug} ({record.status})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <CollectionPreviewLink label="Hosted list" value={hostedListPreviewUrl} />
                    <CollectionPreviewLink label="Hosted item" value={hostedItemPreviewUrl} />
                    <CollectionPreviewLink label="Render list API" value={renderListPreviewUrl} />
                    <CollectionPreviewLink label="Render item API" value={renderItemPreviewUrl} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCollectionApiText(renderItemPreviewUrl || renderListPreviewUrl, 'template preview render URL')}
                    disabled={!renderItemPreviewUrl && !renderListPreviewUrl}
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-950 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-template-preview-copy-render"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy render URL
                  </button>
                  {hostedItemPreviewUrl ? (
                    <a
                      href={hostedItemPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-800"
                      data-testid="collections-template-preview-open-item"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open item preview
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold">List route</h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Controls generated collection index pages and record-card field roles.
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {collectionForm.dynamicTemplates.list.limit} records
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-medium">Layout</span>
                      <select
                        value={collectionForm.dynamicTemplates.list.variant}
                        onChange={(event) => updateDynamicListTemplate({ variant: event.target.value as CollectionDynamicListVariant })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                        data-testid="collections-list-template-variant"
                      >
                        {COLLECTION_DYNAMIC_LIST_VARIANTS.map((variant) => (
                          <option key={variant.value} value={variant.value}>{variant.label}</option>
                        ))}
                      </select>
                      <span className="block text-xs text-muted-foreground">
                        {COLLECTION_DYNAMIC_LIST_VARIANTS.find((variant) => variant.value === collectionForm.dynamicTemplates.list.variant)?.detail}
                      </span>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Title field</span>
                      <select
                        value={collectionForm.dynamicTemplates.list.titleField}
                        onChange={(event) => updateDynamicListTemplate({ titleField: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                      >
                        <option value="">Automatic</option>
                        {dynamicTemplateFields.map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Summary field</span>
                      <select
                        value={collectionForm.dynamicTemplates.list.descriptionField}
                        onChange={(event) => updateDynamicListTemplate({ descriptionField: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                      >
                        <option value="">Automatic</option>
                        {dynamicTemplateFields.map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Image field</span>
                      <select
                        value={collectionForm.dynamicTemplates.list.imageField}
                        onChange={(event) => updateDynamicListTemplate({ imageField: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                      >
                        <option value="">Automatic</option>
                        {dynamicTemplateImageFields.map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Record limit</span>
                      <input
                        type="number"
                        min={1}
                        max={48}
                        value={collectionForm.dynamicTemplates.list.limit}
                        onChange={(event) => updateDynamicListTemplate({ limit: normalizeDynamicTemplateLimit(event.target.value) })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                      />
                    </label>
                    <div className="space-y-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 text-sm md:col-span-2" data-testid="collections-list-authored-template">
                      <div>
                        <div className="font-medium text-cyan-950">Authored list canvas</div>
                        <p className="mt-1 text-xs leading-5 text-cyan-900/80">
                          Capture an existing Backy page canvas as this collection&apos;s dynamic list template.
                        </p>
                      </div>
                      <select
                        value={collectionForm.dynamicTemplates.list.authoredPageId}
                        onChange={(event) => updateDynamicListTemplate({ authoredPageId: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                        data-testid="collections-list-authored-template-select"
                      >
                        <option value="">Generated layout</option>
                        {pages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.title} /{page.slug}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void captureAuthoredDynamicTemplate('list')}
                          disabled={schemaMutationDisabled || isPagesLoading || !collectionForm.dynamicTemplates.list.authoredPageId}
                          className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="collections-list-authored-template-capture"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Capture list canvas
                        </button>
                        <button
                          type="button"
                          onClick={() => clearAuthoredDynamicTemplate('list')}
                          disabled={schemaMutationDisabled || !collectionForm.dynamicTemplates.list.authoredCanvas}
                          className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-medium text-cyan-900 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Clear
                        </button>
                      </div>
                      <p className="text-xs text-cyan-900/80">
                        {collectionForm.dynamicTemplates.list.authoredCanvas
                          ? `Captured ${collectionForm.dynamicTemplates.list.authoredPageTitle || 'page'} with ${collectionForm.dynamicTemplates.list.authoredCanvas.elements.length} root elements.`
                          : pagesError || (isPagesLoading ? 'Loading pages...' : 'No authored list canvas captured.')}
                      </p>
                      <div className="space-y-2 border-t border-cyan-200 pt-2" data-testid="collections-list-template-history">
                        <div className="text-xs font-semibold uppercase tracking-wide text-cyan-950">Template capture history</div>
                        {collectionForm.dynamicTemplates.list.authoredHistory.length > 0 ? (
                          <div className="grid gap-2">
                            {collectionForm.dynamicTemplates.list.authoredHistory.map((version) => (
                              <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan-200 bg-white/80 px-3 py-2 text-xs">
                                <span className="min-w-0">
                                  <span className="block font-medium text-cyan-950">Version {version.version} · {version.pageTitle || 'Untitled page'}</span>
                                  <span className="block text-cyan-900/75">{formatDate(version.capturedAt)} · {version.elementCount} root elements</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => restoreAuthoredDynamicTemplateVersion('list', version)}
                                  disabled={schemaMutationDisabled}
                                  className="inline-flex items-center gap-1 rounded-md border border-cyan-200 px-2 py-1 font-medium text-cyan-900 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <History className="h-3 w-3" />
                                  Restore
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-cyan-900/70">No saved capture history yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <div>
                    <h4 className="text-sm font-semibold">Item route</h4>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Controls generated detail pages and the field set rendered below the hero content.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-medium">Layout</span>
                      <select
                        value={collectionForm.dynamicTemplates.item.variant}
                        onChange={(event) => updateDynamicItemTemplate({ variant: event.target.value as CollectionDynamicItemVariant })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                        data-testid="collections-item-template-variant"
                      >
                        {COLLECTION_DYNAMIC_ITEM_VARIANTS.map((variant) => (
                          <option key={variant.value} value={variant.value}>{variant.label}</option>
                        ))}
                      </select>
                      <span className="block text-xs text-muted-foreground">
                        {COLLECTION_DYNAMIC_ITEM_VARIANTS.find((variant) => variant.value === collectionForm.dynamicTemplates.item.variant)?.detail}
                      </span>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Title field</span>
                      <select
                        value={collectionForm.dynamicTemplates.item.titleField}
                        onChange={(event) => updateDynamicItemTemplate({ titleField: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                      >
                        <option value="">Use list setting</option>
                        {dynamicTemplateFields.map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Summary field</span>
                      <select
                        value={collectionForm.dynamicTemplates.item.descriptionField}
                        onChange={(event) => updateDynamicItemTemplate({ descriptionField: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                      >
                        <option value="">Use list setting</option>
                        {dynamicTemplateFields.map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-medium">Image field</span>
                      <select
                        value={collectionForm.dynamicTemplates.item.imageField}
                        onChange={(event) => updateDynamicItemTemplate({ imageField: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                      >
                        <option value="">Use list setting</option>
                        {dynamicTemplateImageFields.map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 text-sm md:col-span-2" data-testid="collections-item-authored-template">
                      <div>
                        <div className="font-medium text-cyan-950">Authored item canvas</div>
                        <p className="mt-1 text-xs leading-5 text-cyan-900/80">
                          Capture an existing Backy page canvas as the dynamic record-detail template.
                        </p>
                      </div>
                      <select
                        value={collectionForm.dynamicTemplates.item.authoredPageId}
                        onChange={(event) => updateDynamicItemTemplate({ authoredPageId: event.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-2"
                        data-testid="collections-item-authored-template-select"
                      >
                        <option value="">Generated layout</option>
                        {pages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.title} /{page.slug}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void captureAuthoredDynamicTemplate('item')}
                          disabled={schemaMutationDisabled || isPagesLoading || !collectionForm.dynamicTemplates.item.authoredPageId}
                          className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="collections-item-authored-template-capture"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Capture item canvas
                        </button>
                        <button
                          type="button"
                          onClick={() => clearAuthoredDynamicTemplate('item')}
                          disabled={schemaMutationDisabled || !collectionForm.dynamicTemplates.item.authoredCanvas}
                          className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-medium text-cyan-900 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Clear
                        </button>
                      </div>
                      <p className="text-xs text-cyan-900/80">
                        {collectionForm.dynamicTemplates.item.authoredCanvas
                          ? `Captured ${collectionForm.dynamicTemplates.item.authoredPageTitle || 'page'} with ${collectionForm.dynamicTemplates.item.authoredCanvas.elements.length} root elements.`
                          : pagesError || (isPagesLoading ? 'Loading pages...' : 'No authored item canvas captured.')}
                      </p>
                      <div className="space-y-2 border-t border-cyan-200 pt-2" data-testid="collections-item-template-history">
                        <div className="text-xs font-semibold uppercase tracking-wide text-cyan-950">Template capture history</div>
                        {collectionForm.dynamicTemplates.item.authoredHistory.length > 0 ? (
                          <div className="grid gap-2">
                            {collectionForm.dynamicTemplates.item.authoredHistory.map((version) => (
                              <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan-200 bg-white/80 px-3 py-2 text-xs">
                                <span className="min-w-0">
                                  <span className="block font-medium text-cyan-950">Version {version.version} · {version.pageTitle || 'Untitled page'}</span>
                                  <span className="block text-cyan-900/75">{formatDate(version.capturedAt)} · {version.elementCount} root elements</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => restoreAuthoredDynamicTemplateVersion('item', version)}
                                  disabled={schemaMutationDisabled}
                                  className="inline-flex items-center gap-1 rounded-md border border-cyan-200 px-2 py-1 font-medium text-cyan-900 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <History className="h-3 w-3" />
                                  Restore
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-cyan-900/70">No saved capture history yet.</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 text-sm md:col-span-2">
                      <span className="font-medium">Detail fields</span>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {dynamicTemplateFields.map((field) => (
                          <label key={field.key} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                            <input
                              type="checkbox"
                              checked={collectionForm.dynamicTemplates.item.detailFields.includes(field.key)}
                              onChange={(event) => toggleDynamicDetailField(field.key, event.target.checked)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block font-medium text-foreground">{field.label}</span>
                              <span className="block text-muted-foreground">{field.key} · {field.type}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {dynamicTemplateFields.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Add at least one field before choosing detail fields.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Leave all unchecked to show every non-title, non-summary, non-image field with values.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold">Fields</h3>
                <button
                  type="button"
                  onClick={() => setCollectionForm((prev) => ({
                    ...prev,
                    fields: [...prev.fields, createEmptyField((prev.fields.length + 1) * 10)],
                  }))}
                  disabled={schemaMutationDisabled}
                  title={editPermissionTitle}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  Add field
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Key</th>
                      <th className="px-4 py-2">Label</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Options / reference</th>
                      <th className="px-4 py-2">Required</th>
                      <th className="px-4 py-2">Unique</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {collectionForm.fields.map((field, index) => (
                      <tr key={`${field.key}-${index}`}>
                        <td className="px-4 py-2">
                          <input
                            value={field.key}
                            onChange={(event) => updateField(index, { key: event.target.value })}
                            className="w-full rounded-lg border bg-background px-2 py-1"
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={field.label}
                            onChange={(event) => updateField(index, { label: event.target.value })}
                            className="w-full rounded-lg border bg-background px-2 py-1"
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={field.type}
                            onChange={(event) => updateField(index, { type: event.target.value as CollectionFieldType })}
                            className="w-full rounded-lg border bg-background px-2 py-1"
                          >
                            {FIELD_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          {field.type === 'select' || field.type === 'tags' ? (
                            <textarea
                              value={formatFieldOptions(field.options)}
                              onChange={(event) => updateField(index, { options: parseFieldOptions(event.target.value) })}
                              className="min-h-16 w-full rounded-lg border bg-background px-2 py-1"
                              placeholder="One option per line"
                            />
                          ) : field.type === 'reference' || field.type === 'multiReference' ? (
                            <select
                              value={field.referenceCollectionId || ''}
                              onChange={(event) => updateField(index, { referenceCollectionId: event.target.value || null })}
                              className="w-full rounded-lg border bg-background px-2 py-1"
                            >
                              <option value="">Choose collection</option>
                              {collections
                                .filter((collection) => collection.id !== selectedCollectionId)
                                .map((collection) => (
                                  <option key={collection.id} value={collection.id}>{collection.name}</option>
                                ))}
                            </select>
                          ) : (
                            <input
                              value={field.helpText || ''}
                              onChange={(event) => updateField(index, { helpText: event.target.value || null })}
                              className="w-full rounded-lg border bg-background px-2 py-1"
                              placeholder="Help text"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) => updateField(index, { required: event.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={field.unique}
                            onChange={(event) => updateField(index, { unique: event.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeField(index)}
                            disabled={collectionForm.fields.length === 1 || schemaMutationDisabled}
                            title={collectionForm.fields.length === 1 ? 'At least one field is required.' : editPermissionTitle}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </fieldset>
          </form>

          {activeCollection && (
            <section id="collections-records" className="rounded-lg border border-border bg-card scroll-mt-24">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Records</h2>
                  <p className="text-xs text-muted-foreground">
                    {recordPagination.total} items in {activeCollection.name}
                    {isRecordsLoading ? ' • Loading...' : ''}
                  </p>
                  <a
                    href={`${dynamicBaseUrl}${buildCollectionListRoutePath(activeCollection)}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={isCollectionsBusy}
                    onClick={(event) => {
                      if (isCollectionsBusy) event.preventDefault();
                    }}
                    className={cn(
                      'mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline',
                      isCollectionsBusy && 'pointer-events-none opacity-60',
                    )}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View list page
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => void handleImportRecords(event)}
                    aria-label="Import collection records CSV"
                  />
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    disabled={recordMutationDisabled}
                    title={editPermissionTitle}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Import collection records CSV"
                  >
                    <Upload className="h-4 w-4" />
                    {isImportingRecords ? 'Importing...' : 'Import CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportRecords()}
                    disabled={recordExportDisabled}
                    title={exportPermissionTitle}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {isExportingRecords ? 'Exporting...' : 'Export CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (recordMutationDisabled) return;
                      setSelectedRecordId(null);
                      setRecordForm({ slug: '', status: 'published', values: {} });
                      updateCollectionsRouteSearch({ recordId: undefined });
                    }}
                    disabled={recordMutationDisabled}
                    title={editPermissionTitle}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    New record
                  </button>
                </div>
              </div>

              <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(180px,1fr)_150px_160px_minmax(160px,1fr)_180px_140px]">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Search</span>
                  <input
                    value={recordFilters.search}
                    onChange={(event) => updateRecordFilters({ search: event.target.value })}
                    disabled={isCollectionsBusy}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Search values"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Status</span>
                  <select
                    value={recordFilters.status}
                    disabled={isCollectionsBusy}
                    onChange={(event) => updateRecordFilters({
                      status: event.target.value as RecordStatusFilter,
                    })}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">All</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Field</span>
                  <select
                    value={recordFilters.fieldKey}
                    disabled={isCollectionsBusy}
                    onChange={(event) => updateRecordFilters({
                      fieldKey: event.target.value,
                      fieldValue: event.target.value ? recordFilters.fieldValue : '',
                    })}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Any field</option>
                    {activeCollection.fields.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Field value</span>
                  <input
                    value={recordFilters.fieldValue}
                    onChange={(event) => updateRecordFilters({ fieldValue: event.target.value })}
                    disabled={!recordFilters.fieldKey || isCollectionsBusy}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Contains"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Sort by</span>
                  <select
                    value={recordFilters.sortBy}
                    disabled={isCollectionsBusy}
                    onChange={(event) => updateRecordFilters({ sortBy: event.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="updatedAt">Updated</option>
                    <option value="createdAt">Created</option>
                    <option value="slug">Slug</option>
                    <option value="status">Status</option>
                    {activeCollection.fields.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Direction</span>
                  <select
                    value={recordFilters.sortDirection}
                    disabled={isCollectionsBusy}
                    onChange={(event) => updateRecordFilters({
                      sortDirection: event.target.value === 'asc' ? 'asc' : 'desc',
                    })}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </label>
              </div>

              {selectedRecordIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 text-sm" data-testid="collections-record-bulk-toolbar">
                  <span className="font-medium">
                    {selectedRecordIds.length} selected
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('published')}
                      disabled={recordMutationDisabled}
                      title={editPermissionTitle}
                      data-testid="collections-record-bulk-publish"
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('draft')}
                      disabled={recordMutationDisabled}
                      title={editPermissionTitle}
                      data-testid="collections-record-bulk-draft"
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('archived')}
                      disabled={recordMutationDisabled}
                      title={editPermissionTitle}
                      data-testid="collections-record-bulk-archive"
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRecordIds([])}
                      disabled={isCollectionsBusy}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (destructiveActionDisabled) return;
                        setPendingBulkDelete(true);
                      }}
                      disabled={destructiveActionDisabled}
                      title={deletePermissionTitle}
                      className="rounded-lg border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="overflow-x-auto border-b border-border xl:border-b-0 xl:border-r">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={allRecordsOnPageSelected}
                            disabled={isCollectionsBusy}
                            onChange={(event) => togglePageRecordSelection(event.target.checked)}
                            aria-label="Select all records on this page"
                          />
                        </th>
                        <th className="px-4 py-2">Slug</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Updated</th>
                        <th className="px-4 py-2">Route</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            No records
                          </td>
                        </tr>
                      ) : records.map((record) => {
                        const routePath = buildCollectionRecordRoutePath(activeCollection, record.slug);
                        const href = `${dynamicBaseUrl}/sites/${activeSiteSlug}${routePath}`;
                        return (
                          <tr key={record.id} className={record.id === selectedRecordId ? 'bg-primary/5' : ''}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedRecordIds.includes(record.id)}
                                disabled={isCollectionsBusy}
                                onChange={(event) => toggleRecordSelection(record.id, event.target.checked)}
                                aria-label={`Select record ${record.slug}`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isCollectionsBusy) return;
                                  setSelectedRecordId(record.id);
                                  updateCollectionsRouteSearch({ recordId: record.id });
                                }}
                                disabled={isCollectionsBusy}
                                className="font-medium text-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {record.slug}
                              </button>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(record.updatedAt || record.createdAt || '')}</td>
                            <td className="px-4 py-3">
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                aria-disabled={isCollectionsBusy}
                                onClick={(event) => {
                                  if (isCollectionsBusy) event.preventDefault();
                                }}
                                className={cn(
                                  'inline-flex items-center gap-1 text-primary hover:underline',
                                  isCollectionsBusy && 'pointer-events-none opacity-60',
                                )}
                              >
                                {routePath}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  if (destructiveActionDisabled) return;
                                  setPendingRecordDelete(record);
                                }}
                                disabled={destructiveActionDisabled}
                                title={deletePermissionTitle}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
                    <div className="text-muted-foreground">
                      Showing {recordRangeStart}-{recordRangeEnd} of {recordPagination.total}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-muted-foreground">
                        Rows
                        <select
                          value={recordPagination.limit}
                          disabled={isCollectionsBusy}
                          onChange={(event) => {
                            if (isCollectionsBusy) return;
                            const limit = Number(event.target.value);
                            setRecordPagination((prev) => ({
                              ...prev,
                              limit,
                              offset: 0,
                            }));
                            updateCollectionsRouteSearch({ limit, offset: undefined });
                          }}
                          className="rounded-lg border bg-background px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </label>
                      <span className="text-muted-foreground">
                        Page {recordPage} of {recordPageCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (isCollectionsBusy) return;
                          const offset = Math.max(0, recordPagination.offset - recordPagination.limit);
                          setRecordPagination((prev) => ({
                            ...prev,
                            offset,
                          }));
                          updateCollectionsRouteSearch({ offset: offset || undefined });
                        }}
                        disabled={recordPagination.offset === 0 || isCollectionsBusy}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                        aria-label="Previous records page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isCollectionsBusy) return;
                          const offset = recordPagination.offset + recordPagination.limit;
                          setRecordPagination((prev) => ({
                            ...prev,
                            offset,
                          }));
                          updateCollectionsRouteSearch({ offset });
                        }}
                        disabled={!recordPagination.hasMore || isCollectionsBusy}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                        aria-label="Next records page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleRecordSubmit} className="p-4">
                  <fieldset disabled={recordMutationDisabled} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{selectedRecord ? 'Edit record' : 'Create record'}</h3>
                    <button
                      type="submit"
                      disabled={recordMutationDisabled}
                      title={editPermissionTitle}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {isSavingRecord ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Slug</span>
                    <input
                      value={recordForm.slug}
                      onChange={(event) => setRecordForm((prev) => ({
                        ...prev,
                        slug: normalizeSlug(event.target.value, 'record'),
                      }))}
                      className="w-full rounded-lg border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Status</span>
                    <select
                      value={recordForm.status}
                      onChange={(event) => setRecordForm((prev) => ({
                        ...prev,
                        status: event.target.value as CollectionRecord['status'],
                      }))}
                      className="w-full rounded-lg border bg-background px-3 py-2"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>

                  {activeCollection.fields.map((field) => (
                    <label key={field.key} className="space-y-1 text-sm">
                      <span className="font-medium">{field.label}</span>
                      {field.type === 'boolean' ? (
                        <select
                          value={recordForm.values[field.key] || 'false'}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                        >
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : field.type === 'select' && field.options?.length ? (
                        <select
                          value={recordForm.values[field.key] || ''}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        >
                          <option value="">Choose {field.label}</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : field.type === 'tags' && field.options?.length ? (
                        <select
                          multiple
                          value={(recordForm.values[field.key] || '').split(',').map((item) => item.trim()).filter(Boolean)}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: {
                              ...prev.values,
                              [field.key]: Array.from(event.target.selectedOptions).map((option) => option.value).join(', '),
                            },
                          }))}
                          className="min-h-24 w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        >
                          {field.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : field.type === 'richText' || field.type === 'json' ? (
                        <textarea
                          value={recordForm.values[field.key] || ''}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="min-h-24 w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                          value={recordForm.values[field.key] || ''}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        />
                      )}
                    </label>
                  ))}
                  </fieldset>
                </form>
              </div>
            </section>
          )}
        </div>
      </div>

      {pendingCollectionDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingCollectionDelete.name}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This deletes the schema and every record in it. Archive the collection if you only want to remove it from public delivery.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Slug: <span className="font-medium text-foreground">/{pendingCollectionDelete.slug}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingCollectionDelete(null)}
                disabled={isCollectionsBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCollection(pendingCollectionDelete)}
                disabled={destructiveActionDisabled}
                title={deletePermissionTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCollection ? 'Deleting...' : 'Delete collection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRecordDelete && activeCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingRecordDelete.slug}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the record from {activeCollection.name} and from any frontend route using it.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRecordDelete(null)}
                disabled={isCollectionsBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteRecord(pendingRecordDelete)}
                disabled={destructiveActionDisabled}
                title={deletePermissionTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingRecord ? 'Deleting...' : 'Delete record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDelete && activeCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {selectedRecordIds.length} selected records?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The selected {activeCollection.name} records will be removed from the API and public routes.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                disabled={isCollectionsBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDeleteRecords()}
                disabled={destructiveActionDisabled}
                title={deletePermissionTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingRecord ? 'Deleting...' : 'Delete records'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

type CollectionSchemaExportColumn = typeof COLLECTION_SCHEMA_EXPORT_COLUMNS[number];

interface CollectionSchemaExportContext {
  activeSiteId: string;
  publicBaseUrl: string;
  adminBaseUrl: string;
}

const collectionToSchemaExportRecord = (
  collection: Collection,
  context: CollectionSchemaExportContext,
): Record<CollectionSchemaExportColumn, string | number | boolean | null> => {
  const collectionSegment = encodeURIComponent(collection.id);
  const siteSegment = encodeURIComponent(context.activeSiteId);
  const publicCollectionsUrl = `${context.publicBaseUrl}/api/sites/${siteSegment}/collections`;
  const publicRecordsUrl = `${publicCollectionsUrl}/${collectionSegment}/records?status=published`;
  const publicRecordBySlugUrl = `${publicCollectionsUrl}/${collectionSegment}/records?slug={recordSlug}`;
  const adminCollectionUrl = `${context.adminBaseUrl}/sites/${siteSegment}/collections/${collectionSegment}`;
  const adminRecordsUrl = `${adminCollectionUrl}/records`;
  const relationFields = collection.fields.filter((field) => RELATION_FIELD_TYPES.includes(field.type));
  const mediaFields = collection.fields.filter((field) => MEDIA_FIELD_TYPES.includes(field.type));
  const requiredFields = collection.fields.filter((field) => field.required);
  const uniqueFields = collection.fields.filter((field) => field.unique);

  return {
    collection_id: collection.id,
    active_site_id: context.activeSiteId,
    name: collection.name,
    slug: collection.slug,
    status: collection.status,
    description: collection.description || '',
    public_read: collection.permissions.publicRead,
    public_create: collection.permissions.publicCreate,
    public_update: collection.permissions.publicUpdate,
    public_delete: collection.permissions.publicDelete,
    field_count: collection.fields.length,
    required_field_count: requiredFields.length,
    unique_field_count: uniqueFields.length,
    relation_field_count: relationFields.length,
    media_field_count: mediaFields.length,
    field_keys: collection.fields.map((field) => field.key).join('; '),
    field_types: collection.fields.map((field) => `${field.key}:${field.type}`).join('; '),
    required_fields: requiredFields.map((field) => field.key).join('; '),
    unique_fields: uniqueFields.map((field) => field.key).join('; '),
    relation_fields: relationFields.map((field) => `${field.key}:${field.referenceCollectionId || 'unmapped'}`).join('; '),
    media_fields: mediaFields.map((field) => `${field.key}:${field.type}`).join('; '),
    public_list_route: buildCollectionListRoutePath(collection),
    public_item_route_template: buildCollectionRecordRouteTemplate(collection),
    public_collections_url: publicCollectionsUrl,
    public_records_url: publicRecordsUrl,
    public_record_by_slug_url: publicRecordBySlugUrl,
    admin_collection_url: adminCollectionUrl,
    admin_records_url: adminRecordsUrl,
    admin_import_url: `${adminRecordsUrl}/import?upsert=true`,
    admin_bulk_url: `${adminRecordsUrl}/bulk`,
    frontend_systems: COLLECTION_FRONTEND_SYSTEMS.map((system) => `${system.key}:${system.title}`).join('; '),
    created_at: collection.createdAt || '',
    updated_at: collection.updatedAt || '',
  };
};

const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function CollectionApiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function CollectionReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ready ? 'text-emerald-600' : 'text-amber-600'}`} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

const collectionAuditMetadataText = (log: AdminAuditLog, key: string): string => {
  const sources = [log.metadata, log.after, log.before];
  for (const source of sources) {
    const value = source?.[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
};

const collectionAuditTitle = (log: AdminAuditLog): string => {
  if (log.entity === 'collectionRecord') {
    if (log.action === 'create') return 'Collection record created';
    if (log.action === 'update') return log.metadata?.bulk ? 'Collection record bulk-updated' : 'Collection record updated';
    if (log.action === 'delete') return log.metadata?.bulk ? 'Collection record bulk-deleted' : 'Collection record deleted';
  }
  if (log.action === 'create') return 'Collection created';
  if (log.action === 'update') return 'Collection updated';
  if (log.action === 'delete') return 'Collection deleted';
  return log.action.replace(/[._-]+/g, ' ');
};

const collectionAuditPermission = (action: string): string => (
  action === 'delete' ? 'collections.delete' : 'collections.edit'
);

const collectionAuditDescription = (log: AdminAuditLog): string => {
  if (log.entity === 'collectionRecord') {
    const collectionName = collectionAuditMetadataText(log, 'collectionName') || collectionAuditMetadataText(log, 'collectionSlug');
    const collectionSlug = collectionAuditMetadataText(log, 'collectionSlug');
    const slug = collectionAuditMetadataText(log, 'slug') || log.entityId;
    const status = collectionAuditMetadataText(log, 'status');
    const valueCount = collectionAuditMetadataText(log, 'valueCount');
    const bulkAction = collectionAuditMetadataText(log, 'bulkAction');
    const requestedCount = collectionAuditMetadataText(log, 'requestedCount');
    const matchedCount = collectionAuditMetadataText(log, 'matchedCount');
    const changedFields = Array.isArray(log.metadata?.changedFields)
      ? log.metadata.changedFields.filter((field): field is string => typeof field === 'string').join(', ')
      : '';

    return [
      collectionName,
      collectionSlug && slug ? `/${collectionSlug}/${slug}` : slug,
      status || null,
      valueCount ? `${valueCount} values` : null,
      changedFields ? `changed ${changedFields}` : null,
      bulkAction ? `bulk ${bulkAction}` : null,
      matchedCount && requestedCount ? `${matchedCount}/${requestedCount} matched` : null,
    ].filter(Boolean).join(' · ');
  }

  const name = collectionAuditMetadataText(log, 'name') || log.entityId;
  const slug = collectionAuditMetadataText(log, 'slug');
  const status = collectionAuditMetadataText(log, 'status');
  const fieldCount = collectionAuditMetadataText(log, 'fieldCount');
  const changedFields = Array.isArray(log.metadata?.changedFields)
    ? log.metadata.changedFields.filter((field): field is string => typeof field === 'string').join(', ')
    : '';

  return [
    name,
    slug ? `/${slug}` : null,
    status || null,
    fieldCount ? `${fieldCount} fields` : null,
    changedFields ? `changed ${changedFields}` : null,
  ].filter(Boolean).join(' · ');
};

function CollectionAuditLogCard({ log }: { log: AdminAuditLog }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{collectionAuditTitle(log)}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{collectionAuditDescription(log)}</div>
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {collectionAuditPermission(log.action)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{formatDate(log.createdAt)}</span>
        {log.requestId ? <code className="rounded bg-muted px-1.5 py-0.5">{log.requestId}</code> : null}
      </div>
    </div>
  );
}

function CollectionRoutePreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <code className="mt-1 block truncate font-mono text-xs text-foreground">{value || 'Not configured'}</code>
    </div>
  );
}

function CollectionPreviewLink({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
      <div className="text-xs font-medium text-indigo-900/70">{label}</div>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate font-mono text-xs text-indigo-950 underline-offset-2 hover:underline"
        >
          {value}
        </a>
      ) : (
        <code className="mt-1 block truncate font-mono text-xs text-indigo-900/60">Select a record</code>
      )}
    </div>
  );
}

function CollectionWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index}
      </span>
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function CollectionApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

function PermissionSwitch({
  label,
  description,
  checked,
  disabled = false,
  onChange,
  testId,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <label
      className={`flex min-h-24 items-start gap-3 rounded-lg border border-border bg-background p-3 ${
        disabled ? 'cursor-not-allowed opacity-65' : 'cursor-pointer hover:bg-muted/40'
      }`}
      data-testid={testId}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-1"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
