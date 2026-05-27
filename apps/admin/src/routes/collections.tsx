import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
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
  MoreHorizontal,
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
  exportCollectionsBackup,
  exportCollectionRecordsCsv,
  getCollectionRecord,
  getPage,
  getUserPermissions,
  getSiteFrontendDesign,
  importCollectionsBackup,
  importCollectionRecordsCsv,
  listAllCollectionRecords,
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
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
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
  frontendTemplate?: string;
  draft?: 'new';
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

const actionState = (disabledReason: string) => (disabledReason ? 'blocked' : 'ready');

export const Route = createFileRoute('/collections')({
  validateSearch: (search: Record<string, unknown>): CollectionsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    collectionId: normalizedSearchString(search.collectionId),
    recordId: normalizedSearchString(search.recordId),
    frontendTemplate: normalizedSearchString(search.frontendTemplate),
    draft: search.draft === 'new' ? 'new' : undefined,
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
type CollectionMediaPermissionKey = 'media.view' | 'media.create';

const COLLECTION_PERMISSION_ROLE_DEFAULTS: Record<CollectionPermissionKey, Array<'owner' | 'admin' | 'editor' | 'viewer'>> = {
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'collections.edit': ['owner', 'admin', 'editor'],
  'collections.export': ['owner', 'admin'],
  'collections.delete': ['owner', 'admin'],
};

const COLLECTION_MEDIA_PERMISSION_ROLE_DEFAULTS: Record<CollectionMediaPermissionKey, Array<User['role']>> = {
  'media.view': ['owner', 'admin', 'editor', 'viewer'],
  'media.create': ['owner', 'admin', 'editor'],
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
      { key: 'gallery', label: 'Gallery files', type: 'file', required: false, unique: false, sortOrder: 50, validation: { multiple: true } },
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
  customJS?: string;
  themeTokenRefs?: Record<string, string>;
  assets?: unknown[] | Record<string, unknown>;
  animations?: unknown[] | Record<string, unknown>;
  interactions?: unknown[] | Record<string, unknown>;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  contentDocument?: Record<string, unknown>;
  elements: unknown[];
}

interface CollectionAuthoredDynamicTemplateVersion extends CollectionAuthoredDynamicTemplate {
  id: string;
  version: number;
  elementCount: number;
}

interface CollectionAuthoredDynamicTemplateDiff {
  summary: string;
  hasChanges: boolean;
  activePageLabel: string;
  versionPageLabel: string;
  activeRootCount: number;
  versionRootCount: number;
  addedRootIds: string[];
  removedRootIds: string[];
  changedRootIds: string[];
  unchangedRootCount: number;
  pageChanged: boolean;
  canvasSizeChanged: boolean;
  customCssChanged: boolean;
  customJsChanged: boolean;
  designStateChanged: boolean;
  designStateChangeLabels: string[];
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

const COLLECTION_SLUG_UPDATE_BEHAVIORS = [
  {
    value: 'create-only',
    label: 'Generate on create',
    detail: 'Use the source/fallback fields when new records do not provide a slug.',
  },
  {
    value: 'manual',
    label: 'Manual review',
    detail: 'Keep slugs editor-controlled after creation.',
  },
  {
    value: 'sync-drafts',
    label: 'Sync drafts',
    detail: 'Custom frontends can refresh draft slugs before publish.',
  },
] as const;

type CollectionSlugUpdateBehavior = typeof COLLECTION_SLUG_UPDATE_BEHAVIORS[number]['value'];

interface CollectionSlugPolicyForm {
  sourceField: string;
  fallbackField: string;
  updateBehavior: CollectionSlugUpdateBehavior;
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

const createCollectionFieldId = (seed: string | number) => `field_${normalizeSlug(String(seed), 'field').replace(/-/g, '_')}`;

const stableCollectionFieldId = (field: Partial<CollectionField>, fallback: string | number) => {
  const id = typeof field.id === 'string' ? field.id.trim() : '';
  return id || createCollectionFieldId(field.key || fallback);
};

const createEmptyField = (sortOrder: number): CollectionField => ({
  id: createCollectionFieldId(sortOrder),
  key: `field_${sortOrder}`,
  label: `Field ${sortOrder}`,
  type: 'text',
  required: false,
  unique: false,
  sortOrder,
  helpText: null,
});

const createStarterField = (): CollectionField => ({
  id: createCollectionFieldId('title'),
  key: 'title',
  label: 'Title',
  type: 'text',
  required: true,
  unique: false,
  sortOrder: 10,
  helpText: 'Primary display title for each record.',
});

const RELATION_FIELD_TYPES: CollectionFieldType[] = ['reference', 'multiReference'];
const MEDIA_FIELD_TYPES: CollectionFieldType[] = ['image', 'video', 'file'];
const TEXT_FIELD_TYPES: CollectionFieldType[] = ['text', 'richText', 'slug', 'url', 'email', 'phone', 'select', 'tags'];

interface ReferenceRecordOptionsState {
  records: CollectionRecord[];
  loading: boolean;
  error: string | null;
}

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

const findCollectionSlugPolicyField = (
  fields: CollectionField[],
  preferredKeys: string[],
) => findCollectionAuthoringField(fields, preferredKeys, TEXT_FIELD_TYPES);

const defaultSlugPolicy = (fields: CollectionField[] = []): CollectionSlugPolicyForm => {
  const slugField = findCollectionAuthoringField(fields, ['slug', 'permalink'], ['slug', 'text']);
  const titleField = findCollectionSlugPolicyField(fields, ['title', 'name', 'headline', 'label']);
  const fallbackField = titleField && titleField.key !== slugField?.key
    ? titleField
    : fields.find((field) => TEXT_FIELD_TYPES.includes(field.type) && field.key !== slugField?.key) || null;

  return {
    sourceField: slugField?.key || titleField?.key || '',
    fallbackField: fallbackField?.key || '',
    updateBehavior: 'create-only',
  };
};

const normalizeSlugPolicy = (
  metadata: unknown,
  fields: CollectionField[] = [],
): CollectionSlugPolicyForm => {
  const defaults = defaultSlugPolicy(fields);
  if (!isPlainRecord(metadata)) return defaults;
  const policy = isPlainRecord(metadata.slugPolicy) ? metadata.slugPolicy : {};
  const fieldKeys = new Set(fields.map((field) => field.key).filter(Boolean));
  const sourceField = optionalStringFromRecord(policy, 'sourceField') || defaults.sourceField;
  const fallbackField = optionalStringFromRecord(policy, 'fallbackField') || defaults.fallbackField;
  const updateBehavior = COLLECTION_SLUG_UPDATE_BEHAVIORS.some((behavior) => behavior.value === policy.updateBehavior)
    ? policy.updateBehavior as CollectionSlugUpdateBehavior
    : defaults.updateBehavior;

  return {
    sourceField: fieldKeys.has(sourceField) ? sourceField : defaults.sourceField,
    fallbackField: fieldKeys.has(fallbackField) && fallbackField !== sourceField ? fallbackField : defaults.fallbackField,
    updateBehavior,
  };
};

const collectionMetadataWithSlugPolicy = (
  metadata: unknown,
  slugPolicy: CollectionSlugPolicyForm,
  fields: CollectionField[],
): Record<string, unknown> => {
  const baseMetadata = isPlainRecord(metadata) ? { ...metadata } : {};
  const fieldKeys = new Set(fields.map((field) => field.key).filter(Boolean));
  const sourceField = fieldKeys.has(slugPolicy.sourceField) ? slugPolicy.sourceField : '';
  const fallbackField = fieldKeys.has(slugPolicy.fallbackField) && slugPolicy.fallbackField !== sourceField
    ? slugPolicy.fallbackField
    : '';

  return {
    ...baseMetadata,
    slugPolicy: {
      schemaVersion: 'backy.collection-slug-policy.v1',
      routeParameter: ':recordSlug',
      transform: 'lowercase-dashes',
      uniquenessScope: 'collection',
      conflictStrategy: 'reject-duplicates',
      sourceField,
      fallbackField,
      updateBehavior: slugPolicy.updateBehavior,
    },
  };
};

const buildCollectionSlugPolicyReadiness = (
  slugPolicy: CollectionSlugPolicyForm,
  fields: CollectionField[],
  routePattern: string,
  collectionSlug: string,
  previewRecord: CollectionRecord | null,
) => {
  const fieldKeys = new Set(fields.map((field) => field.key).filter(Boolean));
  const sourceField = fields.find((field) => field.key === slugPolicy.sourceField) || null;
  const fallbackField = fields.find((field) => field.key === slugPolicy.fallbackField) || null;
  const normalizedRoute = normalizeCollectionRoutePattern(routePattern, collectionSlug || 'collection');
  const routeHasRecordSlug = normalizedRoute.split('/').includes(':recordSlug');
  const previewSource = sourceField ? formatValue(previewRecord?.values?.[sourceField.key]) : previewRecord?.slug || '';
  const previewFallback = fallbackField ? formatValue(previewRecord?.values?.[fallbackField.key]) : '';
  const exampleSlug = normalizeSlug(previewSource || previewFallback || previewRecord?.slug || 'example-record', 'example-record');
  const checks = [
    {
      label: 'Route parameter',
      detail: routeHasRecordSlug ? `${normalizedRoute} includes :recordSlug` : 'Item route must include :recordSlug.',
      ready: routeHasRecordSlug,
    },
    {
      label: 'Source field',
      detail: sourceField
        ? `${sourceField.label} (${sourceField.key}) feeds slug generation hints.`
        : 'Choose a source field or rely on manual record slugs.',
      ready: Boolean(sourceField || previewRecord?.slug),
    },
    {
      label: 'Duplicate handling',
      detail: 'Admin and import APIs reject duplicate slugs inside this collection.',
      ready: true,
    },
    {
      label: 'Custom frontend handoff',
      detail: 'Expose lowercase-dashes, collection-scoped uniqueness, and :recordSlug routing to external forms/importers.',
      ready: fieldKeys.size > 0,
    },
  ];
  const readyCount = checks.filter((check) => check.ready).length;
  const actionPlan = {
    schemaVersion: 'backy.collection-slug-policy-action-plan.v1',
    status: readyCount === checks.length ? 'ready' : 'needs-policy-review',
    routeTemplate: normalizedRoute,
    exampleItemPath: normalizedRoute.replace(':recordSlug', exampleSlug),
    sourceField: sourceField?.key || null,
    fallbackField: fallbackField?.key || null,
    updateBehavior: slugPolicy.updateBehavior,
    transform: 'lowercase-dashes',
    uniquenessScope: 'collection',
    conflictStrategy: 'reject-duplicates',
    recommendedNextAction: readyCount === checks.length
      ? 'Use the slug policy in custom frontend create/edit forms and import tooling.'
      : 'Choose slug source/fallback fields and keep the item route on :recordSlug before publish.',
    steps: checks.filter((check) => !check.ready).map((check) => check.detail),
  };

  return {
    schemaVersion: 'backy.collection-slug-policy-readiness.v1',
    ready: readyCount === checks.length,
    readyCount,
    checkCount: checks.length,
    sourceField: sourceField?.key || null,
    fallbackField: fallbackField?.key || null,
    updateBehavior: slugPolicy.updateBehavior,
    transform: 'lowercase-dashes',
    uniquenessScope: 'collection',
    conflictStrategy: 'reject-duplicates',
    routeTemplate: normalizedRoute,
    exampleSlug,
    exampleItemPath: normalizedRoute.replace(':recordSlug', exampleSlug),
    checks,
    actionPlan,
  };
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
    return getLocalBackendOrigin();
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
    return `${getLocalBackendOrigin()}/api/admin`;
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

const parseCollectionListValue = (value: string): string[] => (
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const formatCollectionListValue = (items: string[]): string => Array.from(new Set(items)).join(', ');

const collectionFieldValidationRecord = (field: CollectionField): Record<string, unknown> => (
  field.validation && typeof field.validation === 'object' && !Array.isArray(field.validation)
    ? field.validation
    : {}
);

const isCollectionMultiFileField = (field: CollectionField): boolean => {
  if (field.type !== 'file') return false;
  const validation = collectionFieldValidationRecord(field);
  return validation.multiple === true || Number.isFinite(Number(validation.maxItems));
};

const collectionFileMaxItems = (field: CollectionField): number | null => {
  const maxItems = Number(collectionFieldValidationRecord(field).maxItems);
  return Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : null;
};

const mediaFieldValidationWithMultiple = (field: CollectionField, multiple: boolean): Record<string, unknown> | undefined => {
  const current = collectionFieldValidationRecord(field);
  const next = { ...current };
  if (multiple) {
    next.multiple = true;
  } else {
    delete next.multiple;
    delete next.maxItems;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const formatRecordFormValue = (field: CollectionField, value: unknown): string => {
  if (field.type === 'json') {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return formatValue(value);
    }
  }

  return formatValue(value);
};

const parseRecordValue = (field: CollectionField, value: string): unknown => {
  if (field.type === 'number') {
    return value.trim().length > 0 ? Number(value) : null;
  }
  if (field.type === 'boolean') {
    return value === 'true';
  }
  if (field.type === 'tags' || field.type === 'multiReference') {
    return parseCollectionListValue(value);
  }
  if (isCollectionMultiFileField(field)) {
    const mediaIds = parseCollectionListValue(value);
    return mediaIds;
  }
  if (field.type === 'json') {
    if (!value.trim()) return {};
    return JSON.parse(value);
  }
  return value;
};

const validateRecordFieldValue = (field: CollectionField, value: string): string | null => {
  const label = field.label || field.key;
  const trimmed = value.trim();
  const listValue = () => parseCollectionListValue(value);

  if (field.required) {
    if (field.type === 'boolean') {
      return null;
    }
    if (field.type === 'tags' || field.type === 'multiReference' || isCollectionMultiFileField(field)) {
      if (listValue().length === 0) {
        return `${label} is required.`;
      }
    } else if (!trimmed) {
      return `${label} is required.`;
    }
  }

  if (!trimmed) {
    return null;
  }

  if (field.type === 'number' && !Number.isFinite(Number(trimmed))) {
    return `${label} must be a valid number.`;
  }

  if ((field.type === 'date' || field.type === 'datetime') && Number.isNaN(new Date(trimmed).getTime())) {
    return `${label} must be a valid ${field.type === 'date' ? 'date' : 'date and time'}.`;
  }

  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return `${label} must be a valid email address.`;
  }

  if (field.type === 'url') {
    try {
      new URL(trimmed);
    } catch {
      return `${label} must be a valid URL.`;
    }
  }

  if (field.type === 'json') {
    try {
      JSON.parse(trimmed);
    } catch {
      return `${label} must be valid JSON.`;
    }
  }

  if (isCollectionMultiFileField(field)) {
    const maxItems = collectionFileMaxItems(field);
    if (maxItems && listValue().length > maxItems) {
      return `${label} allows at most ${maxItems} file${maxItems === 1 ? '' : 's'}.`;
    }
  }

  return null;
};

const formatDateTimeLocalValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toScheduledAtPayload = (value: string): string | null => {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const updateRecordFormValue = (
  setRecordForm: Dispatch<SetStateAction<{
    slug: string;
    status: CollectionRecord['status'];
    scheduledAt: string;
    values: Record<string, string>;
  }>>,
  fieldKey: string,
  value: string,
) => {
  setRecordForm((prev) => ({
    ...prev,
    values: { ...prev.values, [fieldKey]: value },
  }));
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
    id: stableCollectionFieldId(field, index + 1),
    options: field.options ? [...field.options] : undefined,
    sortOrder: (index + 1) * 10,
  }))
);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const cloneJsonRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!isPlainRecord(value)) return undefined;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
};

const cloneJsonArray = (value: unknown): unknown[] | undefined => (
  Array.isArray(value) ? JSON.parse(JSON.stringify(value)) as unknown[] : undefined
);

const cloneJsonArrayOrRecord = (value: unknown): unknown[] | Record<string, unknown> | undefined => (
  cloneJsonArray(value) || cloneJsonRecord(value)
);

const optionalStringRecordFromRecord = (record: Record<string, unknown> | undefined, key: string): Record<string, string> | undefined => {
  const value = record?.[key];
  if (!isPlainRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  ));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

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
  const contentDocument = cloneJsonRecord(value.contentDocument);
  const metadata = cloneJsonRecord(value.metadata)
    || cloneJsonRecord(contentDocument?.metadata);

  return {
    pageId,
    pageTitle,
    pageSlug,
    capturedAt,
    ...(normalizeCanvasSize(value.canvasSize) ? { canvasSize: normalizeCanvasSize(value.canvasSize) } : {}),
    ...(optionalStringFromRecord(value, 'customCSS') ? { customCSS: optionalStringFromRecord(value, 'customCSS') } : {}),
    ...(optionalStringFromRecord(value, 'customJS') ? { customJS: optionalStringFromRecord(value, 'customJS') } : {}),
    ...(optionalStringRecordFromRecord(value, 'themeTokenRefs') ? { themeTokenRefs: optionalStringRecordFromRecord(value, 'themeTokenRefs') } : {}),
    ...(cloneJsonArrayOrRecord(value.assets) ? { assets: cloneJsonArrayOrRecord(value.assets) } : {}),
    ...(cloneJsonArrayOrRecord(value.animations) ? { animations: cloneJsonArrayOrRecord(value.animations) } : {}),
    ...(cloneJsonArrayOrRecord(value.interactions) ? { interactions: cloneJsonArrayOrRecord(value.interactions) } : {}),
    ...(cloneJsonRecord(value.dataBindings) ? { dataBindings: cloneJsonRecord(value.dataBindings) } : {}),
    ...(cloneJsonRecord(value.editableMap) ? { editableMap: cloneJsonRecord(value.editableMap) } : {}),
    ...(cloneJsonRecord(value.seo) ? { seo: cloneJsonRecord(value.seo) } : {}),
    ...(metadata ? { metadata } : {}),
    ...(contentDocument ? { contentDocument } : {}),
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

const stableTemplateValue = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableTemplateValue(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableTemplateValue(record[key])}`)
    .join(',')}}`;
};

const templateRootElementId = (element: unknown, index: number) => {
  if (isPlainRecord(element)) {
    const id = optionalStringFromRecord(element, 'id');
    if (id) return id;
    const type = optionalStringFromRecord(element, 'type');
    if (type) return `${type}-${index + 1}`;
  }
  return `root-${index + 1}`;
};

const templatePageLabel = (template: CollectionAuthoredDynamicTemplate) => (
  template.pageTitle || template.pageSlug || template.pageId || 'Untitled page'
);

const templateDesignStateEntries = (template: CollectionAuthoredDynamicTemplate) => ({
  'Theme tokens': template.themeTokenRefs || {},
  Assets: template.assets || {},
  Animations: template.animations || [],
  Interactions: template.interactions || {},
  'Data bindings': template.dataBindings || {},
  'Editable map': template.editableMap || {},
  SEO: template.seo || {},
  Metadata: template.metadata || {},
  'Content document': template.contentDocument || {},
});

const compareAuthoredDynamicTemplates = (
  active: CollectionAuthoredDynamicTemplate,
  version: CollectionAuthoredDynamicTemplateVersion,
): CollectionAuthoredDynamicTemplateDiff => {
  const activeRoots = new Map(active.elements.map((element, index) => ([
    templateRootElementId(element, index),
    stableTemplateValue(element),
  ])));
  const versionRoots = new Map(version.elements.map((element, index) => ([
    templateRootElementId(element, index),
    stableTemplateValue(element),
  ])));
  const addedRootIds = Array.from(activeRoots.keys()).filter((id) => !versionRoots.has(id));
  const removedRootIds = Array.from(versionRoots.keys()).filter((id) => !activeRoots.has(id));
  const changedRootIds = Array.from(activeRoots.entries())
    .filter(([id, fingerprint]) => versionRoots.has(id) && versionRoots.get(id) !== fingerprint)
    .map(([id]) => id);
  const unchangedRootCount = Array.from(activeRoots.entries())
    .filter(([id, fingerprint]) => versionRoots.has(id) && versionRoots.get(id) === fingerprint)
    .length;
  const activeSize = active.canvasSize ? `${active.canvasSize.width}x${active.canvasSize.height}` : '';
  const versionSize = version.canvasSize ? `${version.canvasSize.width}x${version.canvasSize.height}` : '';
  const pageChanged = active.pageId !== version.pageId;
  const canvasSizeChanged = activeSize !== versionSize;
  const customCssChanged = (active.customCSS || '') !== (version.customCSS || '');
  const customJsChanged = (active.customJS || '') !== (version.customJS || '');
  const activeDesignState = templateDesignStateEntries(active);
  const versionDesignState = templateDesignStateEntries(version);
  const designStateChangeLabels = Object.keys(activeDesignState).filter((label) => (
    stableTemplateValue(activeDesignState[label as keyof typeof activeDesignState])
      !== stableTemplateValue(versionDesignState[label as keyof typeof versionDesignState])
  ));
  const designStateChanged = designStateChangeLabels.length > 0;
  const totalChanges = addedRootIds.length + removedRootIds.length + changedRootIds.length
    + (pageChanged ? 1 : 0)
    + (canvasSizeChanged ? 1 : 0)
    + (customCssChanged ? 1 : 0)
    + (customJsChanged ? 1 : 0)
    + (designStateChanged ? 1 : 0);

  return {
    summary: totalChanges > 0
      ? `${totalChanges} change${totalChanges === 1 ? '' : 's'} from version ${version.version}`
      : `No root-level changes from version ${version.version}`,
    hasChanges: totalChanges > 0,
    activePageLabel: templatePageLabel(active),
    versionPageLabel: templatePageLabel(version),
    activeRootCount: active.elements.length,
    versionRootCount: version.elements.length,
    addedRootIds,
    removedRootIds,
    changedRootIds,
    unchangedRootCount,
    pageChanged,
    canvasSizeChanged,
    customCssChanged,
    customJsChanged,
    designStateChanged,
    designStateChangeLabels,
  };
};

const summarizeTemplateRootIds = (ids: string[]) => {
  if (ids.length === 0) return 'None';
  const visible = ids.slice(0, 4).join(', ');
  return ids.length > 4 ? `${visible}, +${ids.length - 4} more` : visible;
};

const authoredDynamicTemplateDesignStateSummary = (template: CollectionAuthoredDynamicTemplate): string => {
  const assetGroups = template.assets ? Object.keys(template.assets).length : 0;
  const bindingGroups = template.dataBindings ? Object.keys(template.dataBindings).length : 0;
  const editableTargets = template.editableMap ? Object.keys(template.editableMap).length : 0;
  return [
    `${template.elements.length} root elements`,
    `${template.animations?.length || 0} animations`,
    `${assetGroups} asset groups`,
    `${bindingGroups} binding groups`,
    `${editableTargets} editable targets`,
    template.contentDocument ? 'content document' : 'no content document',
  ].join(' · ');
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
    ...(optionalStringFromRecord(content, 'customJS') || optionalStringFromRecord(metadata, 'customJS')
      ? { customJS: optionalStringFromRecord(content, 'customJS') || optionalStringFromRecord(metadata, 'customJS') }
      : {}),
    ...(optionalStringRecordFromRecord(content, 'themeTokenRefs') || optionalStringRecordFromRecord(contentDocument, 'themeTokenRefs') || optionalStringRecordFromRecord(metadata, 'themeTokenRefs')
      ? { themeTokenRefs: optionalStringRecordFromRecord(content, 'themeTokenRefs') || optionalStringRecordFromRecord(contentDocument, 'themeTokenRefs') || optionalStringRecordFromRecord(metadata, 'themeTokenRefs') }
      : {}),
    ...(cloneJsonArrayOrRecord(content.assets) || cloneJsonArrayOrRecord(contentDocument.assets) || cloneJsonArrayOrRecord(metadata.assets)
      ? { assets: cloneJsonArrayOrRecord(content.assets) || cloneJsonArrayOrRecord(contentDocument.assets) || cloneJsonArrayOrRecord(metadata.assets) }
      : {}),
    ...(cloneJsonArrayOrRecord(content.animations) || cloneJsonArrayOrRecord(contentDocument.animations) || cloneJsonArrayOrRecord(metadata.animations)
      ? { animations: cloneJsonArrayOrRecord(content.animations) || cloneJsonArrayOrRecord(contentDocument.animations) || cloneJsonArrayOrRecord(metadata.animations) }
      : {}),
    ...(cloneJsonArrayOrRecord(content.interactions) || cloneJsonArrayOrRecord(contentDocument.interactions) || cloneJsonArrayOrRecord(metadata.interactions)
      ? { interactions: cloneJsonArrayOrRecord(content.interactions) || cloneJsonArrayOrRecord(contentDocument.interactions) || cloneJsonArrayOrRecord(metadata.interactions) }
      : {}),
    ...(cloneJsonRecord(content.dataBindings) || cloneJsonRecord(contentDocument.dataBindings) || cloneJsonRecord(metadata.dataBindings)
      ? { dataBindings: cloneJsonRecord(content.dataBindings) || cloneJsonRecord(contentDocument.dataBindings) || cloneJsonRecord(metadata.dataBindings) }
      : {}),
    ...(cloneJsonRecord(content.editableMap) || cloneJsonRecord(contentDocument.editableMap) || cloneJsonRecord(metadata.editableMap)
      ? { editableMap: cloneJsonRecord(content.editableMap) || cloneJsonRecord(contentDocument.editableMap) || cloneJsonRecord(metadata.editableMap) }
      : {}),
    ...(cloneJsonRecord(content.seo) || cloneJsonRecord(contentDocument.seo) || cloneJsonRecord(metadata.seo)
      ? { seo: cloneJsonRecord(content.seo) || cloneJsonRecord(contentDocument.seo) || cloneJsonRecord(metadata.seo) }
      : {}),
    ...(cloneJsonRecord(metadata) ? { metadata: cloneJsonRecord(metadata) } : {}),
    ...(cloneJsonRecord(contentDocument) ? { contentDocument: cloneJsonRecord(contentDocument) } : {}),
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
  if (!permissionMatrix && currentAdmin) {
    return COLLECTION_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role);
  }
  return false;
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
  if (!permissionMatrix) {
    return 'Permission matrix unavailable. Reload permissions before using this capability.';
  }
  return COLLECTION_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)
    ? `Blocked until backend permissions include ${key}; ${currentAdmin.role} role defaults are not enough.`
    : `Blocked by backend permissions and ${currentAdmin.role} role defaults.`;
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
  const [deepLinkedRecord, setDeepLinkedRecord] = useState<CollectionRecord | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isCollectionDraftMode, setIsCollectionDraftMode] = useState(false);
  const collectionDraftModeRef = useRef(false);
  const [dynamicTemplatePreviewRecordId, setDynamicTemplatePreviewRecordId] = useState('');
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    slug: '',
    listRoutePattern: '',
    routePattern: '',
    description: '',
    status: 'published' as Collection['status'],
    permissions: DEFAULT_PERMISSIONS,
    frontendDesignTemplateId: routeSearch.frontendTemplate || '',
    dynamicTemplates: defaultDynamicTemplates(),
    slugPolicy: defaultSlugPolicy([createStarterField()]),
    visitorWritePolicy: defaultVisitorWritePolicy(),
    fields: [createStarterField()],
  });
  const [recordForm, setRecordForm] = useState({
    slug: '',
    status: 'published' as CollectionRecord['status'],
    scheduledAt: '',
    values: {} as Record<string, string>,
  });
  const [recordFormSubmitted, setRecordFormSubmitted] = useState(false);
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
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isSelectingMatchingRecords, setIsSelectingMatchingRecords] = useState(false);
  const [isCreatingFrontendTemplateId, setIsCreatingFrontendTemplateId] = useState<string | null>(null);
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [collectionAuditLogs, setCollectionAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationDetails, setValidationDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [authoredTemplateCompareVersionIds, setAuthoredTemplateCompareVersionIds] = useState({ list: '', item: '' });
  const [pendingCollectionDelete, setPendingCollectionDelete] = useState<Collection | null>(null);
  const [pendingRecordDelete, setPendingRecordDelete] = useState<CollectionRecord | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [mediaPickerField, setMediaPickerField] = useState<CollectionField | null>(null);
  const [referenceRecordsByCollection, setReferenceRecordsByCollection] = useState<Record<string, ReferenceRecordOptionsState>>({});
  const importInputRef = useRef<HTMLInputElement>(null);
  const backupImportInputRef = useRef<HTMLInputElement>(null);
  const collectionInteractionVersionRef = useRef(0);
  const recordInteractionVersionRef = useRef(0);
  const isCollectionMutationPending = isSavingCollection || isImportingBackup || isExportingBackup || Boolean(isCreatingFrontendTemplateId);
  const isRecordMutationPending = isSavingRecord || isImportingRecords || isExportingRecords || isSelectingMatchingRecords;
  const isCollectionsBusy = isLoading || isRecordsLoading || isCollectionMutationPending || isRecordMutationPending;

  const setCollectionDraftMode = (nextDraftMode: boolean) => {
    collectionDraftModeRef.current = nextDraftMode;
    setIsCollectionDraftMode(nextDraftMode);
  };

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
  const activeReferenceCollectionIds = useMemo(() => {
    if (!activeCollection) return [];
    return Array.from(new Set(
      activeCollection.fields
        .filter((field) => RELATION_FIELD_TYPES.includes(field.type))
        .map((field) => field.referenceCollectionId)
        .filter((collectionId): collectionId is string => Boolean(collectionId && collectionId !== activeCollection.id)),
    )).sort();
  }, [activeCollection]);
  const activeReferenceCollectionIdsKey = activeReferenceCollectionIds.join('|');
  const frontendCollectionTemplates = useMemo(
    () => (frontendDesign?.templates || []).filter((template) => template.type === 'collection'),
    [frontendDesign?.templates],
  );
  const activeFrontendTemplateId = routeSearch.frontendTemplate || '';
  const frontendCollectionTemplateBlueprints = useMemo(
    () => frontendCollectionTemplates.map((template) => ({
      template,
      blueprint: buildFrontendCollectionTemplateBlueprint(template),
    })),
    [frontendCollectionTemplates],
  );
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) || (deepLinkedRecord?.id === selectedRecordId ? deepLinkedRecord : null),
    [deepLinkedRecord, records, selectedRecordId],
  );
  const dynamicTemplatePreviewRecord = useMemo(
    () => records.find((record) => record.id === dynamicTemplatePreviewRecordId)
      || records.find((record) => record.status === 'published')
      || records[0]
      || null,
    [dynamicTemplatePreviewRecordId, records],
  );
  const selectedListTemplateCompareVersion = useMemo(
    () => collectionForm.dynamicTemplates.list.authoredHistory.find((version) => (
      version.id === authoredTemplateCompareVersionIds.list
    )) || collectionForm.dynamicTemplates.list.authoredHistory[0] || null,
    [authoredTemplateCompareVersionIds.list, collectionForm.dynamicTemplates.list.authoredHistory],
  );
  const selectedItemTemplateCompareVersion = useMemo(
    () => collectionForm.dynamicTemplates.item.authoredHistory.find((version) => (
      version.id === authoredTemplateCompareVersionIds.item
    )) || collectionForm.dynamicTemplates.item.authoredHistory[0] || null,
    [authoredTemplateCompareVersionIds.item, collectionForm.dynamicTemplates.item.authoredHistory],
  );
  const listTemplateDiff = useMemo(
    () => (collectionForm.dynamicTemplates.list.authoredCanvas && selectedListTemplateCompareVersion
      ? compareAuthoredDynamicTemplates(collectionForm.dynamicTemplates.list.authoredCanvas, selectedListTemplateCompareVersion)
      : null),
    [collectionForm.dynamicTemplates.list.authoredCanvas, selectedListTemplateCompareVersion],
  );
  const itemTemplateDiff = useMemo(
    () => (collectionForm.dynamicTemplates.item.authoredCanvas && selectedItemTemplateCompareVersion
      ? compareAuthoredDynamicTemplates(collectionForm.dynamicTemplates.item.authoredCanvas, selectedItemTemplateCompareVersion)
      : null),
    [collectionForm.dynamicTemplates.item.authoredCanvas, selectedItemTemplateCompareVersion],
  );
  const dynamicBaseUrl = getPublicBaseUrl();
  const recordPage = Math.floor(recordPagination.offset / recordPagination.limit) + 1;
  const recordPageCount = Math.max(1, Math.ceil(recordPagination.total / recordPagination.limit));
  const recordRangeStart = recordPagination.total === 0 ? 0 : recordPagination.offset + 1;
  const recordRangeEnd = Math.min(recordPagination.total, recordPagination.offset + records.length);
  const selectedRecordIdSet = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds]);
  const selectedRecordsOnPage = useMemo(() => (
    records.filter((record) => selectedRecordIdSet.has(record.id))
  ), [records, selectedRecordIdSet]);
  const selectedRecordsOnPageIds = useMemo(() => selectedRecordsOnPage.map((record) => record.id), [selectedRecordsOnPage]);
  const hiddenSelectedRecordCount = Math.max(0, selectedRecordIds.length - selectedRecordsOnPageIds.length);
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
  const adminBackupExportUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections/export${activeCollection ? `?ids=${encodeURIComponent(activeCollection.id)}` : ''}`;
  const adminBackupImportUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections/import?upsert=true`;
  const activeCollectionIsPublic = activeCollection?.status === 'published' && activeCollection.permissions?.publicRead === true;
  const recordsCopyUrl = activeCollectionIsPublic ? publicRecordsUrl : adminRecordsUrl;
  const recordsCopyLabel = activeCollectionIsPublic ? 'Public records URL' : 'Admin records URL';
  const canUseCollectionRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseCollectionRoleDefaults;
  const canViewCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view');
  const canEditCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.edit');
  const canExportCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.export');
  const canDeleteCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.delete');
  const canViewMedia = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.view', COLLECTION_MEDIA_PERMISSION_ROLE_DEFAULTS);
  const canCreateMedia = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.create', COLLECTION_MEDIA_PERMISSION_ROLE_DEFAULTS);
  const schemaMutationDisabled = isLoading || isCollectionMutationPending || !canEditCollections;
  const recordMutationDisabled = isCollectionsBusy || !canEditCollections;
  const recordExportDisabled = isCollectionsBusy || !canExportCollections;
  const destructiveActionDisabled = isCollectionsBusy || !canDeleteCollections;
  const recordScheduledInlineError = recordFormSubmitted && recordForm.status === 'scheduled' && !recordForm.scheduledAt
    ? 'Choose a publish date before scheduling this collection record.'
    : null;
  const recordFieldInlineErrors = useMemo(() => {
    if (!activeCollection || !recordFormSubmitted) {
      return {};
    }

    return activeCollection.fields.reduce<Record<string, string>>((errors, field) => {
      const fieldError = validateRecordFieldValue(field, recordForm.values[field.key] || '');
      if (fieldError) {
        errors[field.key] = fieldError;
      }
      return errors;
    }, {});
  }, [activeCollection, recordForm.values, recordFormSubmitted]);
  const viewPermissionTitle = canViewCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.view');
  const editPermissionTitle = canEditCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.edit');
  const exportPermissionTitle = canExportCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.export');
  const deletePermissionTitle = canDeleteCollections ? undefined : collectionPermissionReason(permissionMatrix, currentAdmin, 'collections.delete');
  const mediaViewPermissionTitle = canViewMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.view', COLLECTION_MEDIA_PERMISSION_ROLE_DEFAULTS);
  const mediaCreatePermissionTitle = canCreateMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.create', COLLECTION_MEDIA_PERMISSION_ROLE_DEFAULTS);
  const recordActionBusyReason = isCollectionsBusy
    ? 'Collection record actions are temporarily unavailable while Backy updates records.'
    : '';
  const recordBulkEditDisabledReason = recordActionBusyReason || (!canEditCollections
    ? editPermissionTitle || 'Your account cannot edit collection records.'
    : '');
  const recordBulkClearDisabledReason = recordActionBusyReason;
  const recordBulkDeleteDisabledReason = recordActionBusyReason || (!canDeleteCollections
    ? deletePermissionTitle || 'Your account cannot delete collection records.'
    : '');
  const selectedRecordActionLabel = `${selectedRecordIds.length} selected record${selectedRecordIds.length === 1 ? '' : 's'}`;
  const recordBulkActionStatusId = 'collections-record-bulk-action-status';
  const recordBulkActionStatus = [
    recordBulkEditDisabledReason ? `Publish selected unavailable: ${recordBulkEditDisabledReason}` : `Publish selected available for ${selectedRecordActionLabel}.`,
    recordBulkEditDisabledReason ? `Draft selected unavailable: ${recordBulkEditDisabledReason}` : `Draft selected available for ${selectedRecordActionLabel}.`,
    recordBulkEditDisabledReason ? `Archive selected unavailable: ${recordBulkEditDisabledReason}` : `Archive selected available for ${selectedRecordActionLabel}.`,
    recordBulkClearDisabledReason ? `Clear selection unavailable: ${recordBulkClearDisabledReason}` : `Clear selection available for ${selectedRecordActionLabel}.`,
    recordBulkDeleteDisabledReason ? `Delete selected unavailable: ${recordBulkDeleteDisabledReason}` : `Delete selected available for ${selectedRecordActionLabel}.`,
  ].join(' ');
  const schemaActionDisabledTitle = isPermissionMatrixPending
    ? 'Loading collection permissions...'
    : !canEditCollections
      ? editPermissionTitle
      : isLoading
        ? 'Loading collections...'
        : isCollectionMutationPending
          ? 'Collection schema operation in progress...'
          : undefined;
  const isNewCollectionDraftOpen = isCollectionDraftMode && !activeCollection;
  const newCollectionButtonLabel = isNewCollectionDraftOpen ? 'Draft open - name schema' : 'Start collection draft';
  const newCollectionButtonTitle = isNewCollectionDraftOpen
    ? 'A new collection draft is open. Jump to the schema form.'
    : schemaActionDisabledTitle;
  const newCollectionDisabledReason = schemaMutationDisabled
    ? schemaActionDisabledTitle || 'New collection is temporarily unavailable.'
    : undefined;
  const collectionActionStatusId = 'collections-collection-action-status';
  const backupImportDisabledReason = isLoading
    ? 'Collections are loading.'
    : isImportingBackup
      ? 'A collection JSON import is already running.'
      : isSavingCollection
        ? 'A collection schema is saving.'
        : isExportingBackup
          ? 'A collection JSON export is in progress.'
          : isCreatingFrontendTemplateId
            ? 'A frontend template collection is being created.'
            : !canEditCollections
              ? editPermissionTitle || 'Your account cannot edit collections.'
              : '';
  const newCollectionActionStatus = newCollectionDisabledReason
    ? `New collection unavailable: ${newCollectionDisabledReason}`
    : isNewCollectionDraftOpen
      ? `New collection draft is open for ${activeSiteId}.`
      : `New collection available for ${activeSiteId}.`;
  const backupImportActionStatus = backupImportDisabledReason
    ? `Import JSON unavailable: ${backupImportDisabledReason}`
    : `Import JSON available for ${activeSiteId}.`;
  const collectionActionStatus = `${newCollectionActionStatus} ${backupImportActionStatus}`;
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
  const slugPolicyReadiness = useMemo(
    () => buildCollectionSlugPolicyReadiness(
      collectionForm.slugPolicy,
      activeSchemaFields,
      collectionForm.routePattern,
      collectionForm.slug || 'collection',
      dynamicTemplatePreviewRecord,
    ),
    [
      activeSchemaFields,
      collectionForm.routePattern,
      collectionForm.slug,
      collectionForm.slugPolicy,
      dynamicTemplatePreviewRecord,
    ],
  );
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
      {
        label: 'Slug policy',
        detail: slugPolicyReadiness.ready
          ? `${slugPolicyReadiness.exampleItemPath} with duplicate rejection`
          : 'Choose slug source/fallback fields and keep item routes on :recordSlug.',
        ready: slugPolicyReadiness.ready,
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
    slugPolicyReadiness.exampleItemPath,
    slugPolicyReadiness.ready,
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
            slugPolicy: slugPolicyReadiness,
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
      selectedVisibleRecords: selectedRecordsOnPageIds.length,
      hiddenSelectedRecords: hiddenSelectedRecordCount,
    },
    activeCollection: activeCollection ? {
      id: activeCollection.id,
      name: activeCollection.name,
      slug: activeCollection.slug,
      status: activeCollection.status,
      description: activeCollection.description,
      permissions: activeCollection.permissions,
      slugPolicy: slugPolicyReadiness,
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
      selectedRecordsOnPageIds,
      hiddenSelectedRecordCount,
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
    adminBackupExportUrl,
    adminBackupImportUrl,
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
    slugPolicyReadiness,
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
    selectedRecordsOnPageIds,
    hiddenSelectedRecordCount,
    selectedRecordIds,
  ]);
  const collectionHandoffText = useMemo(() => JSON.stringify(collectionHandoff, null, 2), [collectionHandoff]);
  const collectionsRouteSearch = useMemo<CollectionsSearch>(() => ({
    siteId: activeSiteId,
    ...(isCollectionDraftMode && !selectedCollectionId ? { draft: 'new' as const } : {}),
    ...(selectedCollectionId ? { collectionId: selectedCollectionId } : {}),
    ...(selectedRecordId ? { recordId: selectedRecordId } : {}),
    ...(activeFrontendTemplateId ? { frontendTemplate: activeFrontendTemplateId } : {}),
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
    activeFrontendTemplateId,
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
    isCollectionDraftMode,
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
      ...(merged.frontendTemplate?.trim() ? { frontendTemplate: merged.frontendTemplate.trim() } : {}),
      ...(merged.draft === 'new' && !merged.collectionId ? { draft: 'new' as const } : {}),
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

  const hasRecordFilters = Boolean(
    recordFilters.search.trim()
    || recordFilters.status
    || recordFilters.fieldKey
    || recordFilters.fieldValue.trim()
    || recordFilters.sortBy !== 'updatedAt'
    || recordFilters.sortDirection !== 'desc',
  );

  const clearRecordFilters = () => {
    updateRecordFilters({
      search: '',
      status: '',
      fieldKey: '',
      fieldValue: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
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

  const selectMatchingRecords = async () => {
    if (!activeCollection || isCollectionsBusy) return;
    if (!canViewCollections) {
      showPermissionDenied('collections.view', 'select matching collection records');
      return;
    }

    setIsSelectingMatchingRecords(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const result = await listAllCollectionRecords(activeSiteId, activeCollection.id, {
        search: recordFilters.search.trim() || undefined,
        status: recordFilters.status || undefined,
        fieldKey: recordFilters.fieldKey || undefined,
        fieldValue: recordFilters.fieldValue.trim() || undefined,
        sortBy: recordFilters.sortBy || undefined,
        sortDirection: recordFilters.sortDirection,
        limit: 1000,
        offset: 0,
      });
      const matchingIds = result.records.map((record) => record.id);
      setSelectedRecordIds(matchingIds);
      setNotice(`Selected ${matchingIds.length} ${activeCollection.name} record${matchingIds.length === 1 ? '' : 's'} matching the current filters.`);
    } catch (selectionError) {
      showApiError(selectionError, 'Unable to select matching collection records');
    } finally {
      setIsSelectingMatchingRecords(false);
    }
  };

  const beginNewRecord = () => {
    if (recordMutationDisabled) return;

    recordInteractionVersionRef.current += 1;
    setSelectedRecordId(null);
    setSelectedRecordIds([]);
    setRecordForm({ slug: '', status: 'published', scheduledAt: '', values: {} });
    setRecordFormSubmitted(false);
    updateCollectionsRouteSearch({ recordId: undefined });
    setError(null);
    setValidationDetails([]);
    setNotice('New record draft ready. Add values, then save the record.');
    window.requestAnimationFrame(() => {
      document.getElementById('collections-record-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      window.setTimeout(() => {
        document.getElementById('collections-record-slug')?.focus();
      }, 150);
    });
  };

  const showApiError = (apiError: unknown, fallback: string) => {
    setError(apiError instanceof Error ? apiError.message : fallback);
    if (apiError instanceof AdminContentApiError) {
      const details = formatValidationDetails(apiError.details);
      setValidationDetails(apiError.code ? [`Error code: ${apiError.code}`, ...details] : details);
      return;
    }

    setValidationDetails([]);
  };

  const showPermissionDenied = (key: CollectionPermissionKey, action: string) => {
    setNotice(null);
    setValidationDetails([]);
    setError(`Your account needs ${key} to ${action}. ${collectionPermissionReason(permissionMatrix, currentAdmin, key)}`);
  };

  const copyCollectionApiText = async (
    value: string,
    label: string,
    permission?: { key: CollectionPermissionKey; action: string },
  ) => {
    if (isCollectionsBusy) return;
    if (permission && !isCollectionPermissionAllowed(permissionMatrix, currentAdmin, permission.key)) {
      showPermissionDenied(permission.key, permission.action);
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
  const downloadCollectionHandoff = () => {
    if (isCollectionsBusy) return;
    if (!canExportCollections) {
      showPermissionDenied('collections.export', 'export collection handoff manifests');
      return;
    }

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
    if (!canExportCollections) {
      showPermissionDenied('collections.export', 'export collection schemas');
      return;
    }

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

  const downloadCollectionsBackup = async () => {
    if (isCollectionsBusy) return;
    if (!canExportCollections) {
      showPermissionDenied('collections.export', 'export collection backups');
      return;
    }

    setIsExportingBackup(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const backup = await exportCollectionsBackup(activeSiteId, {
        collectionIds: activeCollection ? [activeCollection.id] : undefined,
        includeRecords: true,
      });
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activeSiteSlug}-${activeCollection?.slug || 'collections'}-backup.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`Collections JSON backup exported (${backup.backup.collectionCount} collections, ${backup.backup.recordCount} records).`);
    } catch (exportError) {
      showApiError(exportError, 'Unable to export collections backup');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleImportCollectionsBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    if (isCollectionsBusy) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'import collection backups');
      event.target.value = '';
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingBackup(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const parsed = JSON.parse(await file.text()) as { collections?: unknown[] };
      const result = await importCollectionsBackup(activeSiteId, parsed, { upsert: true });
      const backendCollections = await listCollections(activeSiteId);
      setCollections(backendCollections);
      const nextSelected = result.collections[0]
        ? backendCollections.find((collection) => collection.id === result.collections[0].id || collection.slug === result.collections[0].slug)
        : null;
      if (nextSelected) {
        selectCollection(nextSelected);
      }
      void loadCollectionAuditLogs();
      setNotice(
        `Collections JSON backup imported from ${file.name}: ` +
        `${result.import.createdCollections} created, ${result.import.updatedCollections} updated, ` +
        `${result.import.createdRecords} records created, ${result.import.updatedRecords} records updated.`,
      );
    } catch (importError) {
      if (importError instanceof SyntaxError) {
        setError('Unable to import collections backup: invalid JSON file.');
      } else {
        showApiError(importError, 'Unable to import collections backup');
      }
    } finally {
      setIsImportingBackup(false);
      event.target.value = '';
    }
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    let cancelled = false;

    const loadFrontendDesign = async () => {
      if (isPermissionMatrixPending) return;
      if (!canViewCollections) {
        setFrontendDesign(null);
        setFrontendDesignError(viewPermissionTitle || 'Your account cannot view collection frontend templates.');
        setFrontendDesignLoading(false);
        return;
      }

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
  }, [activeSiteId, canViewCollections, isPermissionMatrixPending, viewPermissionTitle]);

  useEffect(() => {
    let cancelled = false;

    const loadPageTemplates = async () => {
      if (isPermissionMatrixPending) return;
      if (!canViewCollections) {
        setPages([]);
        setPagesError(viewPermissionTitle || 'Your account cannot view collection page templates.');
        setIsPagesLoading(false);
        return;
      }

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
  }, [activeSiteId, canViewCollections, isPermissionMatrixPending, viewPermissionTitle]);

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

  const resetCollectionForm = (options: { draftMode?: boolean; frontendTemplateId?: string } = {}) => {
    collectionInteractionVersionRef.current += 1;
    setCollectionDraftMode(options.draftMode ?? true);
    setSelectedCollectionId(null);
    setSelectedRecordId(null);
    setDeepLinkedRecord(null);
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
      frontendDesignTemplateId: options.frontendTemplateId || '',
      dynamicTemplates: defaultDynamicTemplates(),
      slugPolicy: defaultSlugPolicy([createStarterField()]),
      visitorWritePolicy: defaultVisitorWritePolicy(),
      fields: [createStarterField()],
    });
    setRecordForm({ slug: '', status: 'published', scheduledAt: '', values: {} });
    setRecordFormSubmitted(false);
  };

  const updateCollectionNameInput = (value: string) => {
    setCollectionForm((prev) => ({
      ...prev,
      name: value,
      slug: prev.slug || normalizeSlug(value, 'collection'),
    }));
  };

  const updateCollectionSlugInput = (value: string) => {
    setCollectionForm((prev) => {
      const nextSlug = normalizeSlug(value, 'collection');
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
    });
  };

  const revealCollectionsDraftTarget = useCallback((targetId: string, focusInputId: string) => {
    const target = document.getElementById(targetId) || document.getElementById('collections-schema');
    const focusInput = document.getElementById(focusInputId) || document.getElementById('collections-schema-name');
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (focusInput instanceof HTMLInputElement) {
      focusInput.focus({ preventScroll: true });
      focusInput.select();
    }
  }, []);

  const scrollToNewCollectionDraft = useCallback(() => {
    window.requestAnimationFrame(() => {
      revealCollectionsDraftTarget('collections-draft-starter', 'collections-draft-name');
      window.setTimeout(() => revealCollectionsDraftTarget('collections-draft-starter', 'collections-draft-name'), 150);
      window.setTimeout(() => revealCollectionsDraftTarget('collections-draft-starter', 'collections-draft-name'), 450);
    });
  }, [revealCollectionsDraftTarget]);

  const beginNewCollection = () => {
    if (isCollectionDraftMode && !activeCollection && canEditCollections) {
      setNotice('New collection draft is already open. Add a schema name and fields, then save it to create the collection.');
      scrollToNewCollectionDraft();
      return;
    }

    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', 'create collection schemas');
        return;
      }
      setNotice('Finish the current collection operation before starting a new schema.');
      return;
    }
    resetCollectionForm();
    navigate({ to: '/collections', search: { siteId: activeSiteId, draft: 'new' }, replace: true });
    setError(null);
    setValidationDetails([]);
    setNotice('New collection draft opened. Add a schema name and fields, then save it to create the collection.');
    scrollToNewCollectionDraft();
  };

  useEffect(() => {
    if (!isNewCollectionDraftOpen || !canEditCollections) {
      return;
    }
    scrollToNewCollectionDraft();
  }, [canEditCollections, isNewCollectionDraftOpen, scrollToNewCollectionDraft]);

  const scrollToCollectionSchema = () => {
    const revealSchemaBuilder = () => {
      const form = document.getElementById('collections-schema');
      const nameInput = document.getElementById('collections-schema-name');
      form?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus({ preventScroll: true });
      }
    };

    window.requestAnimationFrame(() => {
      revealSchemaBuilder();
      window.setTimeout(revealSchemaBuilder, 150);
      window.setTimeout(revealSchemaBuilder, 450);
    });
  };

  const resetCollectionsWorkspace = () => {
    setCollections([]);
    resetCollectionForm({ draftMode: false });
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
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'open dynamic page-builder shortcuts');
      return;
    }

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

    const routeRequestsNewDraft = routeSearch.draft === 'new' && !routeSearch.collectionId;
    if (routeRequestsNewDraft) {
      if (!collectionDraftModeRef.current || selectedCollectionId) {
        resetCollectionForm({ frontendTemplateId: routeSearch.frontendTemplate || '' });
      }
      return;
    }

    if (isCollectionDraftMode && !routeSearch.collectionId) {
      return;
    }
    if (isCollectionDraftMode && routeSearch.collectionId) {
      setCollectionDraftMode(false);
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
    routeSearch.draft,
    routeSearch.fieldKey,
    routeSearch.fieldValue,
    routeSearch.frontendTemplate,
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
    if (schemaMutationDisabled) return;
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'prepare a collection template');
      return;
    }

    setCollectionDraftMode(true);
    setSelectedCollectionId(null);
    setSelectedRecordId(null);
    setDeepLinkedRecord(null);
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
      slugPolicy: defaultSlugPolicy(template.fields),
      visitorWritePolicy: defaultVisitorWritePolicy(),
      fields: cloneTemplateFields(template.fields),
    });
    setRecordForm({ slug: '', status: 'published', scheduledAt: '', values: {} });
    setRecordFormSubmitted(false);
    setError(null);
    setValidationDetails([]);
    setNotice(`${template.name} template loaded. Review fields, then save the schema.`);
    navigate({ to: '/collections', search: { siteId: activeSiteId, draft: 'new' }, replace: true });
    window.requestAnimationFrame(() => {
      document.getElementById('collections-schema')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const createCollectionFromFrontendTemplate = async (
    template: SiteFrontendDesignTemplate,
    blueprint: FrontendCollectionTemplateBlueprint,
  ) => {
    if (schemaMutationDisabled) return;
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
      const fields = cloneTemplateFields(blueprint.fields);
      const saved = await createCollection(activeSiteId, {
        name: blueprint.name,
        slug: blueprint.slug,
        listRoutePattern: blueprint.listRoutePattern,
        routePattern: blueprint.routePattern,
        description: blueprint.description,
        status: blueprint.status,
        permissions: blueprint.permissions,
        fields,
        metadata: collectionMetadataWithSlugPolicy(
          metadata,
          defaultSlugPolicy(fields),
          fields,
        ),
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
    setCollectionDraftMode(false);
    setSelectedCollectionId(collection.id);
    setSelectedRecordId(preserveRouteState ? routeSearch.recordId || null : null);
    setDeepLinkedRecord(null);
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
      slugPolicy: normalizeSlugPolicy(collection.metadata, collection.fields),
      visitorWritePolicy: normalizeVisitorWritePolicy(collection.metadata, collection.fields),
      fields: collection.fields.length > 0 ? collection.fields : [createEmptyField(10)],
    });
    setRecordForm({ slug: '', status: 'published', scheduledAt: '', values: {} });
    setRecordFormSubmitted(false);
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
    if (isPermissionMatrixPending) return;
    if (!canViewCollections) {
      setCollections([]);
      setRecords([]);
      setSelectedCollectionId(null);
      setSelectedRecordId(null);
      setSelectedRecordIds([]);
      setDeepLinkedRecord(null);
      setError(viewPermissionTitle || 'Your account cannot view collections.');
      setValidationDetails([]);
      setNotice(null);
      setIsLoading(false);
      return;
    }

    const loadInteractionVersion = collectionInteractionVersionRef.current;
    setIsLoading(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const backendCollections = await listCollections(activeSiteId);
      setCollections(backendCollections);
      if (loadInteractionVersion !== collectionInteractionVersionRef.current) {
        return;
      }
      if ((collectionDraftModeRef.current || routeSearch.draft === 'new') && !routeSearch.collectionId) {
        return;
      }
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
        resetCollectionForm({ draftMode: false });
      }
    } catch (loadError) {
      if (isAdminPermissionDeniedError(loadError)) {
        setCollections([]);
        setRecords([]);
        setSelectedCollectionId(null);
        setSelectedRecordId(null);
        setDeepLinkedRecord(null);
        setSelectedRecordIds([]);
      }
      setError(loadError instanceof Error ? loadError.message : 'Unable to load collections');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecords = async (collectionId: string) => {
    if (isPermissionMatrixPending) return;
    if (!canViewCollections) {
      setRecords([]);
      setSelectedRecordIds([]);
      setDeepLinkedRecord(null);
      setRecordPagination((prev) => ({ ...prev, total: 0, hasMore: false }));
      return;
    }

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
      if (routeSearch.recordId) {
        const shortcutRecord = result.records.find((record) => (
          record.id === routeSearch.recordId ||
          record.slug === routeSearch.recordId
        ));
        if (shortcutRecord) {
          setDeepLinkedRecord(null);
          setSelectedRecordId(shortcutRecord.id);
        } else {
          try {
            const record = await getCollectionRecord(activeSiteId, collectionId, routeSearch.recordId);
            if (!result.records.some((item) => item.id === record.id)) {
              setDeepLinkedRecord(record);
            }
            setSelectedRecordId(record.id);
          } catch {
            setDeepLinkedRecord(null);
            setSelectedRecordId(null);
          }
        }
      } else {
        setDeepLinkedRecord(null);
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
    if (isPermissionMatrixPending) return;
    if (!canExportCollections) {
      setCollectionAuditLogs([]);
      setAuditError(null);
      setIsAuditLoading(false);
      return;
    }

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
    if (!isPermissionMatrixPending) {
      void loadCollections();
      void loadCollectionAuditLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, canViewCollections, canExportCollections, isPermissionMatrixPending]);

  useEffect(() => {
    if (!isPermissionMatrixPending && canViewCollections && selectedCollectionId) {
      void loadRecords(selectedCollectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollectionId, activeSiteId, canViewCollections, isPermissionMatrixPending, recordFilters.search, recordFilters.status, recordFilters.fieldKey, recordFilters.fieldValue, recordFilters.sortBy, recordFilters.sortDirection, recordPagination.limit, recordPagination.offset]);

  useEffect(() => {
    if (isPermissionMatrixPending || !canViewCollections || activeReferenceCollectionIds.length === 0) {
      return;
    }

    activeReferenceCollectionIds.forEach((referenceCollectionId) => {
      setReferenceRecordsByCollection((prev) => ({
        ...prev,
        [referenceCollectionId]: {
          records: prev[referenceCollectionId]?.records || [],
          loading: true,
          error: null,
        },
      }));

      void listCollectionRecords(activeSiteId, referenceCollectionId, {
        limit: 100,
        offset: 0,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      })
        .then((result) => {
          setReferenceRecordsByCollection((prev) => ({
            ...prev,
            [referenceCollectionId]: {
              records: result.records,
              loading: false,
              error: result.pagination.hasMore
                ? 'Showing the 100 most recently updated records. Paste an ID below for older records.'
                : null,
            },
          }));
        })
        .catch((loadError) => {
          setReferenceRecordsByCollection((prev) => ({
            ...prev,
            [referenceCollectionId]: {
              records: prev[referenceCollectionId]?.records || [],
              loading: false,
              error: loadError instanceof Error ? loadError.message : 'Unable to load reference records.',
            },
          }));
        });
    });
  }, [activeReferenceCollectionIdsKey, activeSiteId, canViewCollections, isPermissionMatrixPending]);

  useEffect(() => {
    if (!selectedRecord || !activeCollection) {
      setRecordForm({ slug: '', status: 'published', scheduledAt: '', values: {} });
      setRecordFormSubmitted(false);
      return;
    }

    setRecordForm({
      slug: selectedRecord.slug,
      status: selectedRecord.status,
      scheduledAt: formatDateTimeLocalValue(selectedRecord.scheduledAt),
      values: Object.fromEntries(
        activeCollection.fields.map((field) => [field.key, formatRecordFormValue(field, selectedRecord.values[field.key])]),
      ),
    });
    setRecordFormSubmitted(false);
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
    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', 'update dynamic list templates');
      }
      return;
    }

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
    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', 'update dynamic item templates');
      }
      return;
    }

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
    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', 'update dynamic item detail fields');
      }
      return;
    }

    updateDynamicItemTemplate({
      detailFields: checked
        ? [...collectionForm.dynamicTemplates.item.detailFields, fieldKey]
        : collectionForm.dynamicTemplates.item.detailFields.filter((key) => key !== fieldKey),
    });
  };

  const updateSlugPolicy = (updates: Partial<CollectionSlugPolicyForm>) => {
    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', 'update collection slug policy');
      }
      return;
    }

    setCollectionForm((prev) => ({
      ...prev,
      slugPolicy: {
        ...prev.slugPolicy,
        ...updates,
      },
    }));
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
    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', `capture ${kind} dynamic templates`);
      }
      return;
    }

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
    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', `clear ${kind} dynamic templates`);
      }
      return;
    }

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
    if (schemaMutationDisabled) {
      if (!canEditCollections) {
        showPermissionDenied('collections.edit', `restore ${kind} dynamic template versions`);
      }
      return;
    }

    const restoredCanvas: CollectionAuthoredDynamicTemplate = {
      pageId: version.pageId,
      pageTitle: version.pageTitle,
      pageSlug: version.pageSlug,
      capturedAt: version.capturedAt,
      ...(version.canvasSize ? { canvasSize: version.canvasSize } : {}),
      ...(version.customCSS ? { customCSS: version.customCSS } : {}),
      ...(version.customJS ? { customJS: version.customJS } : {}),
      ...(version.themeTokenRefs ? { themeTokenRefs: version.themeTokenRefs } : {}),
      ...(version.assets ? { assets: version.assets } : {}),
      ...(version.animations ? { animations: version.animations } : {}),
      ...(version.interactions ? { interactions: version.interactions } : {}),
      ...(version.dataBindings ? { dataBindings: version.dataBindings } : {}),
      ...(version.editableMap ? { editableMap: version.editableMap } : {}),
      ...(version.seo ? { seo: version.seo } : {}),
      ...(version.metadata ? { metadata: version.metadata } : {}),
      ...(version.contentDocument ? { contentDocument: version.contentDocument } : {}),
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
    if (isLoading || isCollectionMutationPending) return;
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
        id: stableCollectionFieldId(field, index + 1),
        key: normalizeSlug(field.key, `field_${index + 1}`).replace(/-/g, '_'),
        label: field.label.trim(),
        sortOrder: (index + 1) * 10,
      }));

    try {
      const saveInteractionVersion = collectionInteractionVersionRef.current;
      const collectionSlug = normalizeSlug(collectionForm.slug || collectionForm.name, 'collection');
      const currentMetadata = activeCollection?.metadata;
      const selectedFrontendTemplate = collectionForm.frontendDesignTemplateId
        ? frontendCollectionTemplates.find((template) => template.id === collectionForm.frontendDesignTemplateId) || null
        : null;
      const baseMetadata = collectionMetadataWithVisitorWritePolicy(
        stripFrontendCollectionTemplateMetadata(
          collectionMetadataWithSlugPolicy(
            collectionMetadataWithDynamicTemplates(currentMetadata, collectionForm.dynamicTemplates),
            collectionForm.slugPolicy,
            fields,
          ),
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
      const isCreatingCollection = !selectedCollectionId;
      const saved = selectedCollectionId
        ? await updateCollection(activeSiteId, selectedCollectionId, payload)
        : await createCollection(activeSiteId, payload);
      setCollections((prev) => {
        const exists = prev.some((collection) => collection.id === saved.id);
        return exists
          ? prev.map((collection) => (collection.id === saved.id ? saved : collection))
          : [saved, ...prev];
      });
      if (saveInteractionVersion === collectionInteractionVersionRef.current) {
        selectCollection(saved);
        void loadCollectionAuditLogs();
        setNotice(`${saved.name} collection ${isCreatingCollection ? 'created' : 'updated'}.`);
      }
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
          resetCollectionForm({ draftMode: false });
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
    setRecordFormSubmitted(true);

    const scheduledAt = recordForm.status === 'scheduled'
      ? toScheduledAtPayload(recordForm.scheduledAt)
      : null;
    const inlineValidationDetails = [
      ...(recordForm.status === 'scheduled' && !scheduledAt
        ? ['Choose a publish date before scheduling this collection record.']
        : []),
      ...activeCollection.fields
        .map((field) => validateRecordFieldValue(field, recordForm.values[field.key] || ''))
        .filter((fieldError): fieldError is string => Boolean(fieldError)),
    ];
    if (inlineValidationDetails.length > 0) {
      setError('Fix collection record fields before saving.');
      setValidationDetails(inlineValidationDetails);
      setNotice(null);
      return;
    }

    setIsSavingRecord(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);

    try {
      const saveInteractionVersion = recordInteractionVersionRef.current;
      const values = Object.fromEntries(
        activeCollection.fields.map((field) => [
          field.key,
          parseRecordValue(field, recordForm.values[field.key] || ''),
        ]),
      );
      const payload = {
        slug: normalizeSlug(recordForm.slug || formatValue(values.title || values.name), 'record'),
        status: recordForm.status,
        scheduledAt,
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
      if (saveInteractionVersion === recordInteractionVersionRef.current) {
        setSelectedRecordId(saved.id);
        updateCollectionsRouteSearch({ recordId: saved.id });
      }
      setRecordFormSubmitted(false);
      setNotice(`Collection record ${selectedRecordId ? 'updated' : 'created'}.`);
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

  if (!isPermissionMatrixPending && !canViewCollections) {
    return (
      <PageShell
        title="Collections unavailable"
        description={viewPermissionTitle || 'Your account cannot view collection schemas or records.'}
      >
        <div
          role="alert"
          data-testid="collections-permission-state"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Collection permissions could not be verified</p>
                <p className="mt-1 leading-6">
                  {permissionError || viewPermissionTitle || 'Ask an owner or admin to grant collections.view access.'}
                </p>
              </div>
            </div>
            <Link
              to="/users"
              className="inline-flex shrink-0 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
            >
              Review users
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

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
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={beginNewCollection}
                disabled={schemaMutationDisabled}
                title={newCollectionButtonTitle}
                aria-describedby={`${collectionActionStatusId}${newCollectionDisabledReason ? ' collections-new-collection-disabled-reason' : ''}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Create new collection"
                data-action-state={actionState(newCollectionDisabledReason || '')}
                data-action-status={newCollectionActionStatus}
                data-disabled-reason={newCollectionDisabledReason || undefined}
                data-target-site-id={activeSiteId}
                data-testid="collections-new-collection-button"
              >
                <Plus className="h-4 w-4" />
                {newCollectionButtonLabel}
              </button>
              {isNewCollectionDraftOpen && canEditCollections && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary"
                  data-testid="collections-new-draft-action-state"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-semibold">Draft ready below</span>
                  <button
                    type="button"
                    onClick={scrollToNewCollectionDraft}
                    className="rounded-md border border-primary/30 bg-background px-2 py-1 font-semibold hover:bg-primary/10"
                  >
                    Name schema
                  </button>
                </div>
              )}
            </div>
            {newCollectionDisabledReason && (
              <p
                id="collections-new-collection-disabled-reason"
                className="flex items-center gap-1.5 text-xs font-medium text-amber-700"
                data-testid="collections-new-collection-disabled-reason"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {newCollectionDisabledReason}
              </p>
            )}
          </div>
        </div>
      }
    >
      {error && (
        <div
          role="alert"
          data-testid="collections-error-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Collections workspace needs attention</p>
                <p className="mt-1 leading-6">{error}</p>
                {validationDetails.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {validationDetails.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasRecordFilters && (
                <button
                  type="button"
                  onClick={clearRecordFilters}
                  disabled={isCollectionsBusy}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadCollections()}
                disabled={isCollectionsBusy || !canViewCollections}
                title={!canViewCollections ? viewPermissionTitle : undefined}
                aria-label="Retry loading collections"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry load
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          data-testid="collections-success-notice"
        >
          {notice}
        </div>
      )}

      <span id={collectionActionStatusId} className="sr-only" data-testid="collections-collection-action-status" aria-live="polite">
        {collectionActionStatus}
      </span>

      {isCollectionDraftMode && !activeCollection && canEditCollections && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground md:flex-row md:items-center md:justify-between"
          data-testid="collections-draft-banner"
        >
          <div>
            <div className="font-semibold">Blank collection draft is open</div>
            <p className="mt-1 text-muted-foreground">
              Add a schema name and fields, then save it to create the collection. Nothing is created until the schema is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={scrollToCollectionSchema}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            <Database className="h-4 w-4" />
            Edit schema
          </button>
        </div>
      )}

      {isNewCollectionDraftOpen && canEditCollections && (
        <section
          id="collections-draft-starter"
          className="mb-5 rounded-lg border border-primary/30 bg-card p-4 shadow-sm ring-1 ring-primary/10"
          aria-live="polite"
          data-testid="collections-draft-starter"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  Create mode
                </span>
                <h2 className="text-base font-semibold text-foreground">Blank collection draft</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Name the dataset here, add fields and permissions in the schema builder, then save.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm" htmlFor="collections-draft-name">
                  <span className="font-medium">Collection name</span>
                  <input
                    id="collections-draft-name"
                    form="collections-schema"
                    value={collectionForm.name}
                    onChange={(event) => updateCollectionNameInput(event.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                    placeholder="Blog posts, Products, Team members..."
                    required
                    data-testid="collections-draft-name-input"
                  />
                </label>
                <label className="space-y-1 text-sm" htmlFor="collections-draft-slug">
                  <span className="font-medium">API slug</span>
                  <input
                    id="collections-draft-slug"
                    form="collections-schema"
                    value={collectionForm.slug}
                    onChange={(event) => updateCollectionSlugInput(event.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 font-mono"
                    placeholder="products"
                    required
                    data-testid="collections-draft-slug-input"
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                type="button"
                onClick={scrollToCollectionSchema}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                data-testid="collections-draft-edit-fields"
              >
                <Database className="h-4 w-4" />
                Add fields
              </button>
              <button
                type="submit"
                form="collections-schema"
                disabled={schemaMutationDisabled}
                title={schemaActionDisabledTitle}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="collections-draft-save-schema"
              >
                <Save className="h-4 w-4" />
                {isSavingCollection ? 'Saving...' : 'Save schema'}
              </button>
            </div>
          </div>
        </section>
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
          <div className="flex flex-col gap-2 xl:items-end">
            <div className="flex flex-wrap gap-2 xl:justify-end" data-testid="collections-primary-actions">
              <button
                type="button"
                onClick={beginNewCollection}
                disabled={schemaMutationDisabled}
                title={newCollectionButtonTitle}
                aria-describedby={`${collectionActionStatusId}${newCollectionDisabledReason ? ' collections-library-new-collection-disabled-reason' : ''}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                data-action-state={actionState(newCollectionDisabledReason || '')}
                data-action-status={newCollectionActionStatus}
                data-disabled-reason={newCollectionDisabledReason || undefined}
                data-target-site-id={activeSiteId}
                data-testid="collections-library-new-collection-button"
              >
                <Plus className="h-4 w-4" />
                {newCollectionButtonLabel}
              </button>
              <button
                type="button"
                onClick={downloadCollectionSchemaCsv}
                disabled={collections.length === 0 || isCollectionsBusy || !canExportCollections}
                title={exportPermissionTitle}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="collections-command-export-schemas"
              >
                <Download className="h-4 w-4" />
                Export schemas
              </button>
              <button
                type="button"
                onClick={() => void loadCollections()}
                disabled={isCollectionsBusy || !canViewCollections}
                title={!canViewCollections ? viewPermissionTitle : undefined}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="collections-command-refresh"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {newCollectionDisabledReason && (
                <p
                  id="collections-library-new-collection-disabled-reason"
                  className="flex items-center gap-1.5 text-xs font-medium text-amber-700"
                  data-testid="collections-library-new-collection-disabled-reason"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {newCollectionDisabledReason}
                </p>
              )}
            </div>
            <details className="self-start xl:self-end" data-testid="collections-secondary-actions" data-default-collapsed="true">
              <summary
                className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/60 focus-ring"
                data-testid="collections-more-actions"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                More actions
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2 shadow-sm" data-testid="collections-secondary-action-menu">
                <button
                  type="button"
                  onClick={() => void copyCollectionApiText(collectionHandoffText, 'Collections handoff manifest', {
                    key: 'collections.export',
                    action: 'copy collection handoff manifests',
                  })}
                  disabled={isCollectionsBusy || !canExportCollections}
                  title={exportPermissionTitle}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="collections-command-copy-manifest"
                >
                  <Copy className="h-4 w-4" />
                  Copy manifest
                </button>
                <button
                  type="button"
                  onClick={downloadCollectionHandoff}
                  disabled={isCollectionsBusy || !canExportCollections}
                  title={exportPermissionTitle}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="collections-command-download-json"
                >
                  <Download className="h-4 w-4" />
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={() => void downloadCollectionsBackup()}
                  disabled={collections.length === 0 || isCollectionsBusy || !canExportCollections}
                  title={exportPermissionTitle}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="collections-export-backup"
                >
                  <Download className="h-4 w-4" />
                  {isExportingBackup ? 'Exporting...' : 'Export JSON'}
                </button>
                <input
                  ref={backupImportInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => void handleImportCollectionsBackup(event)}
                  aria-label="Import collections JSON backup"
                  aria-describedby={collectionActionStatusId}
                  disabled={Boolean(backupImportDisabledReason)}
                  data-action-state={actionState(backupImportDisabledReason)}
                  data-action-status={backupImportActionStatus}
                  data-disabled-reason={backupImportDisabledReason || undefined}
                  data-target-site-id={activeSiteId}
                  data-testid="collections-import-backup-input"
                />
                <button
                  type="button"
                  onClick={() => backupImportInputRef.current?.click()}
                  disabled={Boolean(backupImportDisabledReason)}
                  title={backupImportDisabledReason || undefined}
                  aria-describedby={collectionActionStatusId}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  data-action-state={actionState(backupImportDisabledReason)}
                  data-action-status={backupImportActionStatus}
                  data-disabled-reason={backupImportDisabledReason || undefined}
                  data-target-site-id={activeSiteId}
                  data-testid="collections-import-backup"
                >
                  <Upload className="h-4 w-4" />
                  {isImportingBackup ? 'Importing...' : 'Import JSON'}
                </button>
              </div>
            </details>
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

        <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background" data-testid="collections-control-map-details" data-default-collapsed="true">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold text-foreground">Collections control map</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Jump links for site scope, API delivery, schema library, builder, and record operations.
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show map</span>
            <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide map</span>
          </summary>
          <div className="border-t border-border p-4" data-testid="collections-control-map">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
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
        </details>

        <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background" data-testid="collections-connected-workflows-details" data-default-collapsed="true">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Database className="size-4 text-primary" />
                Connected data workflows
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Keep page, media, commerce, form, site, and API shortcuts available without stretching the schema workspace.
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">
              Show workflows
            </span>
            <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide workflows</span>
          </summary>
          <div className="border-t border-border p-4" data-testid="collections-connected-workflows">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-3xl text-sm text-muted-foreground">
                Collections become useful when records can power pages, media-backed fields, commerce objects, public form writes, site routes, and runtime API delivery.
              </p>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {COLLECTION_WORKFLOW_SURFACES.length} surfaces
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
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
        </details>
      </section>

      <details
        id="collections-audit"
        className="group mb-5 overflow-hidden rounded-lg border border-border bg-card shadow-sm scroll-mt-24"
        data-testid="collections-audit-details"
        data-default-collapsed="true"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="inline-flex min-w-0 items-center gap-3">
            <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block">Collections access and activity</span>
              <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                Permission keys plus request-id-backed schema and record activity evidence.
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {collectionAuditLogs.length} shown
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show activity</span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide activity</span>
          </span>
        </summary>
        <section className="border-t border-border bg-background/40 p-4" data-testid="collections-audit-panel">
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
            disabled={isAuditLoading || isPermissionMatrixPending || !canExportCollections}
            title={exportPermissionTitle}
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
            {(canUseCollectionRoleDefaults || isPermissionMatrixPending) && (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="collections-permission-sync-state">
                {canUseCollectionRoleDefaults
                  ? 'Using role defaults while detailed collection permissions sync.'
                  : 'Loading detailed collection permissions before enabling role-specific controls.'}
              </p>
            )}
            {permissionError && (
              <div
                role="alert"
                data-testid="collections-rbac-permission-state"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Collection permissions could not be verified</p>
                      <p className="mt-1 leading-6">{permissionError}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadCollections()}
                    disabled={isCollectionsBusy}
                    aria-label="Retry loading collection permissions"
                    className="inline-flex shrink-0 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Retry permissions
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3 grid gap-2">
              {COLLECTION_PERMISSION_CONTRACT.map((permission) => {
                const allowed = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, permission.key);
                const pending = isPermissionMatrixPending;

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
                <EmptyState
                  icon={History}
                  title="No collection activity yet"
                  description="Collection schema changes, record edits, imports, exports, and deletes will appear here for audit review."
                />
              ) : (
                collectionAuditLogs.map((log) => (
                  <CollectionAuditLogCard key={log.id} log={log} />
                ))
              )}
            </div>
          </div>
        </div>
        </section>
      </details>

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
                    <article
                      key={template.id}
                      className={cn(
                        'rounded-lg border bg-background p-4',
                        activeFrontendTemplateId === template.id
                          ? 'border-teal-600 ring-1 ring-teal-600'
                          : 'border-teal-200',
                      )}
                      data-active={activeFrontendTemplateId === template.id ? 'true' : 'false'}
                    >
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
                            onClick={() => void copyCollectionApiText(manifestText, `${template.name} frontend collection template`, {
                              key: 'collections.export',
                              action: 'export frontend collection template schemas',
                            })}
                            disabled={isCollectionsBusy || !canExportCollections}
                            title={!canExportCollections ? exportPermissionTitle : undefined}
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
              onClick={() => void copyCollectionApiText(recordsCopyUrl, recordsCopyLabel, {
                key: 'collections.export',
                action: 'export collection API records URLs',
              })}
              disabled={isCollectionsBusy || !canExportCollections}
              title={!canExportCollections ? exportPermissionTitle : undefined}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Copy ${activeCollectionIsPublic ? 'public' : 'admin'} records URL`}
          >
            <Copy className="h-4 w-4" />
            {activeCollectionIsPublic ? 'Copy public records' : 'Copy admin records'}
          </button>
          <button
            type="button"
            onClick={() => void copyCollectionApiText(collectionHandoffText, 'Collections handoff manifest', {
              key: 'collections.export',
              action: 'copy collection handoff manifests',
            })}
            disabled={isCollectionsBusy || !canExportCollections}
            title={exportPermissionTitle}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            Copy manifest
          </button>
          <button
            type="button"
            onClick={downloadCollectionSchemaCsv}
            disabled={collections.length === 0 || isCollectionsBusy || !canExportCollections}
            title={exportPermissionTitle}
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
                      onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.repeaterPresetText, 'Repeater dataset preset', {
                        key: 'collections.export',
                        action: 'export dataset authoring shortcuts',
                      })}
                      disabled={isCollectionsBusy || !canExportCollections}
                      title={!canExportCollections ? exportPermissionTitle : undefined}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-authoring-copy-repeater"
                    >
                    <Copy className="h-4 w-4" />
                    Copy repeater preset
                  </button>
                    <button
                      type="button"
                      onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.fieldBindingPresetText, 'Field binding preset', {
                        key: 'collections.export',
                        action: 'export dataset authoring shortcuts',
                      })}
                      disabled={isCollectionsBusy || !canExportCollections}
                      title={!canExportCollections ? exportPermissionTitle : undefined}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-authoring-copy-binding"
                    >
                    <Copy className="h-4 w-4" />
                    Copy field binding
                  </button>
                    <button
                      type="button"
                      onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.listPageBriefText, 'List page dataset brief', {
                        key: 'collections.export',
                        action: 'export dataset authoring shortcuts',
                      })}
                      disabled={isCollectionsBusy || !canExportCollections}
                      title={!canExportCollections ? exportPermissionTitle : undefined}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-authoring-copy-list-brief"
                    >
                    <Copy className="h-4 w-4" />
                    Copy list page brief
                  </button>
                    <button
                      type="button"
                      onClick={() => void copyCollectionApiText(datasetAuthoringShortcuts.itemPageBriefText, 'Item page dataset brief', {
                        key: 'collections.export',
                        action: 'export dataset authoring shortcuts',
                      })}
                      disabled={isCollectionsBusy || !canExportCollections}
                      title={!canExportCollections ? exportPermissionTitle : undefined}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-authoring-copy-item-brief"
                    >
                    <Copy className="h-4 w-4" />
                    Copy item page brief
                  </button>
                    <button
                      type="button"
                      onClick={() => openDatasetPageBuilder('list')}
                      disabled={isCollectionsBusy || !canEditCollections}
                      title={!canEditCollections ? editPermissionTitle : undefined}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-authoring-open-list-builder"
                    >
                    <ExternalLink className="h-4 w-4" />
                    Open list builder
                  </button>
                    <button
                      type="button"
                      onClick={() => openDatasetPageBuilder('item')}
                      disabled={isCollectionsBusy || !canEditCollections}
                      title={!canEditCollections ? editPermissionTitle : undefined}
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
            <CollectionApiSnippet label="JSON backup export" value={adminBackupExportUrl} />
            <CollectionApiSnippet label="JSON backup import" value={adminBackupImportUrl} />
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
              <div className="px-4 py-4">
                <EmptyState
                  icon={Database}
                  title="No collections yet"
                  description="Start a draft schema, add fields, and save it to create reusable CMS data for pages, APIs, and custom frontends."
                  action={(
                    <>
                      <button
                        type="button"
                        onClick={beginNewCollection}
                        disabled={schemaMutationDisabled}
                        title={newCollectionButtonTitle}
                        aria-describedby={collectionActionStatusId}
                        className="mx-auto mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        data-action-state={actionState(newCollectionDisabledReason || '')}
                        data-action-status={newCollectionActionStatus}
                        data-disabled-reason={newCollectionDisabledReason || undefined}
                        data-target-site-id={activeSiteId}
                        data-testid="collections-empty-new-collection-button"
                      >
                        <Plus className="h-4 w-4" />
                        {newCollectionButtonLabel}
                      </button>
                      {newCollectionDisabledReason && (
                        <p className="mt-2 text-xs font-medium text-amber-700">
                          {newCollectionDisabledReason}
                        </p>
                      )}
                    </>
                  )}
                />
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
                  <div data-testid="collections-relationship-outgoing-empty">
                    <EmptyState
                      icon={Database}
                      title="No outgoing relationships"
                      description="Add a reference or multi-reference field to connect this schema to another collection."
                    />
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
                  <div data-testid="collections-relationship-incoming-empty">
                    <EmptyState
                      icon={Database}
                      title="No incoming relationships"
                      description="No saved collections currently point at this schema."
                    />
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
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">Schema builder</h2>
                  {isCollectionDraftMode && !activeCollection && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" data-testid="collections-new-draft-state">
                      New collection draft
                    </span>
                  )}
                </div>
                {isCollectionDraftMode && !activeCollection && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Blank schema ready. Add a name, configure fields, then save the schema.
                  </p>
                )}
              </div>
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
                  title={schemaActionDisabledTitle}
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
                  onChange={(event) => updateCollectionNameInput(event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Slug</span>
                <input
                  value={collectionForm.slug}
                  onChange={(event) => updateCollectionSlugInput(event.target.value)}
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
              <div
                className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/60 p-4 text-sm lg:col-span-3"
                data-testid="collections-slug-policy-controls"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sky-950">Slug policy</div>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-sky-900/80">
                      Define how collection record slugs are generated, previewed, and handed to custom frontends that create or edit dynamic records.
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                      slugPolicyReadiness.ready
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700',
                    )}
                  >
                    {slugPolicyReadiness.ready ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <AlertTriangle className="size-3.5" />
                    )}
                    {slugPolicyReadiness.readyCount}/{slugPolicyReadiness.checkCount} ready
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1">
                    <span className="font-medium text-sky-950">Source field</span>
                    <select
                      value={collectionForm.slugPolicy.sourceField}
                      onChange={(event) => updateSlugPolicy({ sourceField: event.target.value })}
                      disabled={schemaMutationDisabled}
                      title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                      className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-slug-policy-source-field"
                    >
                      <option value="">Manual record slug</option>
                      {dynamicTemplateFields
                        .filter((field) => TEXT_FIELD_TYPES.includes(field.type))
                        .map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label} ({field.key})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-sky-950">Fallback field</span>
                    <select
                      value={collectionForm.slugPolicy.fallbackField}
                      onChange={(event) => updateSlugPolicy({ fallbackField: event.target.value })}
                      disabled={schemaMutationDisabled}
                      title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                      className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-slug-policy-fallback-field"
                    >
                      <option value="">No fallback</option>
                      {dynamicTemplateFields
                        .filter((field) => TEXT_FIELD_TYPES.includes(field.type) && field.key !== collectionForm.slugPolicy.sourceField)
                        .map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label} ({field.key})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-sky-950">Update behavior</span>
                    <select
                      value={collectionForm.slugPolicy.updateBehavior}
                      onChange={(event) => updateSlugPolicy({ updateBehavior: event.target.value as CollectionSlugUpdateBehavior })}
                      disabled={schemaMutationDisabled}
                      title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                      className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-slug-policy-update-behavior"
                    >
                      {COLLECTION_SLUG_UPDATE_BEHAVIORS.map((behavior) => (
                        <option key={behavior.value} value={behavior.value}>
                          {behavior.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  <CollectionApiStat label="Transform" value={slugPolicyReadiness.transform} />
                  <CollectionApiStat label="Unique scope" value={slugPolicyReadiness.uniquenessScope} />
                  <CollectionApiStat label="Duplicates" value={slugPolicyReadiness.conflictStrategy} />
                  <CollectionApiStat label="Example slug" value={slugPolicyReadiness.exampleSlug} />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {slugPolicyReadiness.checks.map((check) => (
                    <CollectionReadinessCheck key={check.label} {...check} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-md bg-white px-2 py-1 text-xs text-sky-900">
                    {slugPolicyReadiness.exampleItemPath}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyCollectionApiText(JSON.stringify(slugPolicyReadiness.actionPlan, null, 2), 'Collection slug policy action plan', {
                      key: 'collections.export',
                      action: 'copy slug policy action plan',
                    })}
                    disabled={isCollectionsBusy || !canExportCollections}
                    title={!canExportCollections ? exportPermissionTitle : undefined}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-950 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-slug-policy-copy-plan"
                  >
                    <Copy className="size-3.5" />
                    Copy slug plan
                  </button>
                </div>
              </div>
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
                        onChange={(event) => {
                          if (schemaMutationDisabled) {
                            if (!canEditCollections) {
                              showPermissionDenied('collections.edit', 'attach frontend collection templates');
                            }
                            return;
                          }
                          setCollectionForm((prev) => ({
                            ...prev,
                            frontendDesignTemplateId: event.target.value,
                          }));
                        }}
                        disabled={schemaMutationDisabled}
                        title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                        className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                    onClick={() => void copyCollectionApiText(renderItemPreviewUrl || renderListPreviewUrl, 'template preview render URL', {
                      key: 'collections.export',
                      action: 'copy template preview render URLs',
                    })}
                    disabled={(!renderItemPreviewUrl && !renderListPreviewUrl) || isCollectionsBusy || !canExportCollections}
                    title={!canExportCollections ? exportPermissionTitle : undefined}
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          ? `Captured ${collectionForm.dynamicTemplates.list.authoredPageTitle || 'page'} with ${authoredDynamicTemplateDesignStateSummary(collectionForm.dynamicTemplates.list.authoredCanvas)}.`
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
                                  <span className="block text-cyan-900/75">{formatDate(version.capturedAt)} · {authoredDynamicTemplateDesignStateSummary(version)}</span>
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
                          <EmptyState
                            icon={History}
                            title="No list template capture history"
                            description="Capture a list canvas to create rollback-ready versions for generated collection index pages."
                          />
                        )}
                      </div>
                      <AuthoredTemplateComparePanel
                        kind="list"
                        history={collectionForm.dynamicTemplates.list.authoredHistory}
                        selectedVersionId={selectedListTemplateCompareVersion?.id || ''}
                        diff={listTemplateDiff}
                        onSelectedVersionIdChange={(versionId) => setAuthoredTemplateCompareVersionIds((prev) => ({
                          ...prev,
                          list: versionId,
                        }))}
                      />
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          disabled={schemaMutationDisabled}
                          title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                          ? `Captured ${collectionForm.dynamicTemplates.item.authoredPageTitle || 'page'} with ${authoredDynamicTemplateDesignStateSummary(collectionForm.dynamicTemplates.item.authoredCanvas)}.`
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
                                  <span className="block text-cyan-900/75">{formatDate(version.capturedAt)} · {authoredDynamicTemplateDesignStateSummary(version)}</span>
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
                          <EmptyState
                            icon={History}
                            title="No item template capture history"
                            description="Capture an item canvas to create rollback-ready versions for generated collection detail pages."
                          />
                        )}
                      </div>
                      <AuthoredTemplateComparePanel
                        kind="item"
                        history={collectionForm.dynamicTemplates.item.authoredHistory}
                        selectedVersionId={selectedItemTemplateCompareVersion?.id || ''}
                        diff={itemTemplateDiff}
                        onSelectedVersionIdChange={(versionId) => setAuthoredTemplateCompareVersionIds((prev) => ({
                          ...prev,
                          item: versionId,
                        }))}
                      />
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
                                disabled={schemaMutationDisabled}
                                title={schemaMutationDisabled && !canEditCollections ? editPermissionTitle : undefined}
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
                      <tr key={field.id || `field-${index}`}>
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
                          ) : field.type === 'file' ? (
                            <div className="grid gap-2">
                              <input
                                value={field.helpText || ''}
                                onChange={(event) => updateField(index, { helpText: event.target.value || null })}
                                className="w-full rounded-lg border bg-background px-2 py-1"
                                placeholder="Help text"
                              />
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={isCollectionMultiFileField(field)}
                                  onChange={(event) => updateField(index, {
                                    validation: mediaFieldValidationWithMultiple(field, event.target.checked),
                                  })}
                                />
                                Allow multiple media files
                              </label>
                              {isCollectionMultiFileField(field) && (
                                <input
                                  type="number"
                                  min="1"
                                  value={collectionFileMaxItems(field) || ''}
                                  onChange={(event) => {
                                    const maxItems = Number(event.target.value);
                                    const validation = {
                                      ...collectionFieldValidationRecord(field),
                                      multiple: true,
                                      ...(Number.isFinite(maxItems) && maxItems > 0 ? { maxItems: Math.floor(maxItems) } : {}),
                                    };
                                    if (!event.target.value.trim()) {
                                      delete validation.maxItems;
                                    }
                                    updateField(index, { validation });
                                  }}
                                  className="w-full rounded-lg border bg-background px-2 py-1"
                                  placeholder="Optional max items"
                                  aria-label={`Maximum files for ${field.label}`}
                                />
                              )}
                            </div>
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
                    href={hostedListPreviewUrl}
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
                    onClick={() => void selectMatchingRecords()}
                    disabled={isCollectionsBusy || recordPagination.total === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-record-select-matching"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {isSelectingMatchingRecords ? 'Selecting...' : 'Select matching'}
                  </button>
                  <button
                    type="button"
                    onClick={beginNewRecord}
                    disabled={recordMutationDisabled}
                    title={editPermissionTitle}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="collections-new-record-button"
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
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 text-sm"
                  role="group"
                  aria-label="Selected collection record actions"
                  aria-describedby={recordBulkActionStatusId}
                  data-testid="collections-record-bulk-toolbar"
                  data-action-status={recordBulkActionStatus}
                >
                  <span id={recordBulkActionStatusId} className="sr-only" data-testid="collections-record-bulk-action-status" aria-live="polite">
                    {recordBulkActionStatus}
                  </span>
                  <span className="font-medium" data-testid="collections-record-bulk-selection-summary">
                    {selectedRecordIds.length} selected
                    {selectedRecordsOnPageIds.length !== selectedRecordIds.length ? ` · ${selectedRecordsOnPageIds.length} visible` : ''}
                    {hiddenSelectedRecordCount > 0 ? ` · ${hiddenSelectedRecordCount} outside this view` : ''}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('published')}
                      disabled={Boolean(recordBulkEditDisabledReason)}
                      aria-disabled={Boolean(recordBulkEditDisabledReason)}
                      aria-describedby={recordBulkActionStatusId}
                      title={recordBulkEditDisabledReason || 'Publish selected records'}
                      data-testid="collections-record-bulk-publish"
                      data-action-state={actionState(recordBulkEditDisabledReason)}
                      data-disabled-reason={recordBulkEditDisabledReason || undefined}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('draft')}
                      disabled={Boolean(recordBulkEditDisabledReason)}
                      aria-disabled={Boolean(recordBulkEditDisabledReason)}
                      aria-describedby={recordBulkActionStatusId}
                      title={recordBulkEditDisabledReason || 'Move selected records to draft'}
                      data-testid="collections-record-bulk-draft"
                      data-action-state={actionState(recordBulkEditDisabledReason)}
                      data-disabled-reason={recordBulkEditDisabledReason || undefined}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('archived')}
                      disabled={Boolean(recordBulkEditDisabledReason)}
                      aria-disabled={Boolean(recordBulkEditDisabledReason)}
                      aria-describedby={recordBulkActionStatusId}
                      title={recordBulkEditDisabledReason || 'Archive selected records'}
                      data-testid="collections-record-bulk-archive"
                      data-action-state={actionState(recordBulkEditDisabledReason)}
                      data-disabled-reason={recordBulkEditDisabledReason || undefined}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRecordIds([])}
                      disabled={Boolean(recordBulkClearDisabledReason)}
                      aria-disabled={Boolean(recordBulkClearDisabledReason)}
                      aria-describedby={recordBulkActionStatusId}
                      title={recordBulkClearDisabledReason || 'Clear selected records'}
                      data-testid="collections-record-bulk-clear-selection"
                      data-action-state={actionState(recordBulkClearDisabledReason)}
                      data-disabled-reason={recordBulkClearDisabledReason || undefined}
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
                      disabled={Boolean(recordBulkDeleteDisabledReason)}
                      aria-disabled={Boolean(recordBulkDeleteDisabledReason)}
                      aria-describedby={recordBulkActionStatusId}
                      title={recordBulkDeleteDisabledReason || 'Delete selected records'}
                      data-testid="collections-record-bulk-delete"
                      data-action-state={actionState(recordBulkDeleteDisabledReason)}
                      data-disabled-reason={recordBulkDeleteDisabledReason || undefined}
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
                                checked={selectedRecordIdSet.has(record.id)}
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
                                  setDeepLinkedRecord(null);
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

                <form id="collections-record-editor" onSubmit={handleRecordSubmit} className="p-4 scroll-mt-24" data-testid="collections-record-editor" noValidate>
                  <fieldset disabled={recordMutationDisabled} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{selectedRecord ? 'Edit record' : 'Create record'}</h3>
                    <button
                      type="submit"
                      disabled={recordMutationDisabled}
                      title={editPermissionTitle}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="collections-record-save-button"
                    >
                      <Save className="h-4 w-4" />
                      {isSavingRecord ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  {!selectedRecord && (
                    <div
                      className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
                      data-testid="collections-record-draft-state"
                    >
                      <span className="font-semibold text-foreground">New record draft</span>
                      <span className="ml-1">Fill the mapped schema fields and save to publish this data through collection APIs.</span>
                    </div>
                  )}
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Slug</span>
                    <input
                      id="collections-record-slug"
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
                  {recordForm.status === 'scheduled' && (
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Scheduled time</span>
                      <input
                        type="datetime-local"
                        value={recordForm.scheduledAt}
                        onChange={(event) => setRecordForm((prev) => ({
                          ...prev,
                          scheduledAt: event.target.value,
                        }))}
                        className={cn(
                          'w-full rounded-lg border bg-background px-3 py-2',
                          recordScheduledInlineError && 'border-destructive focus-visible:outline-destructive',
                        )}
                        aria-required="true"
                        aria-invalid={Boolean(recordScheduledInlineError)}
                        aria-describedby={recordScheduledInlineError ? 'collections-record-scheduled-at-error' : undefined}
                        data-testid="collections-record-scheduled-at"
                      />
                      {recordScheduledInlineError ? (
                        <span
                          id="collections-record-scheduled-at-error"
                          className="block text-xs font-medium text-destructive"
                          data-testid="collections-record-scheduled-at-error"
                        >
                          {recordScheduledInlineError}
                        </span>
                      ) : null}
                    </label>
                  )}

                  {activeCollection.fields.map((field) => (
                    <CollectionRecordFieldEditor
                      key={field.key}
                      field={field}
                      value={recordForm.values[field.key] || ''}
                      collections={collections}
                      currentCollectionId={activeCollection.id}
                      records={records}
                      referenceRecordsByCollection={referenceRecordsByCollection}
                      onOpenMediaPicker={setMediaPickerField}
                      canViewMedia={canViewMedia}
                      mediaViewPermissionTitle={mediaViewPermissionTitle}
                      inlineError={recordFieldInlineErrors[field.key] || null}
                      onChange={(value) => updateRecordFormValue(setRecordForm, field.key, value)}
                    />
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
                  {`The selected ${activeCollection.name} records will be removed from the API and public routes${hiddenSelectedRecordCount > 0 ? `, including ${hiddenSelectedRecordCount} outside this filtered view` : ''}.`}
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

      <MediaLibraryModal
        isOpen={Boolean(mediaPickerField)}
        onClose={() => setMediaPickerField(null)}
        onSelect={(asset) => {
          if (!mediaPickerField || recordMutationDisabled) return;
          if (!canViewMedia) return;

          if (isCollectionMultiFileField(mediaPickerField)) {
            const currentItems = parseCollectionListValue(recordForm.values[mediaPickerField.key] || '');
            const nextItems = formatCollectionListValue([...currentItems, asset.id]);
            const maxItems = collectionFileMaxItems(mediaPickerField);
            if (maxItems && parseCollectionListValue(nextItems).length > maxItems) {
              setError(`${mediaPickerField.label} allows at most ${maxItems} file${maxItems === 1 ? '' : 's'}.`);
              setNotice(null);
              return;
            }
            updateRecordFormValue(setRecordForm, mediaPickerField.key, nextItems);
          } else {
            updateRecordFormValue(setRecordForm, mediaPickerField.key, asset.id);
          }
          setNotice(`Attached ${asset.name} to ${mediaPickerField.label}.`);
          setMediaPickerField(null);
        }}
        allowedTypes={mediaPickerField ? mediaPickerAllowedType(mediaPickerField.type) : 'any'}
        initialUploadFilter={mediaPickerField ? mediaPickerUploadFilter(mediaPickerField.type) : 'file'}
        mediaContext={{
          siteId: activeSiteId,
          scope: 'global',
          targetLabel: `${activeSite?.name || activeSiteId} ${activeCollection?.name || 'collection'} ${mediaPickerField?.label || 'media field'}`,
        }}
        allowScopeSwitcher={false}
        canView={canViewMedia}
        canCreate={canCreateMedia}
        viewDisabledReason={mediaViewPermissionTitle}
        createDisabledReason={mediaCreatePermissionTitle}
      />
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

function collectionRecordInputType(fieldType: CollectionFieldType) {
  if (fieldType === 'number') return 'number';
  if (fieldType === 'date') return 'date';
  if (fieldType === 'datetime') return 'datetime-local';
  if (fieldType === 'email') return 'email';
  if (fieldType === 'url') return 'url';
  return 'text';
}

const mediaPickerAllowedType = (fieldType: CollectionFieldType) => {
  if (fieldType === 'image') return 'image';
  if (fieldType === 'video') return 'video';
  return 'any';
};

const mediaPickerUploadFilter = (fieldType: CollectionFieldType) => {
  if (fieldType === 'image') return 'image';
  if (fieldType === 'video') return 'video';
  return 'file';
};

function CollectionRecordFieldEditor({
  field,
  value,
  collections,
  currentCollectionId,
  records,
  referenceRecordsByCollection,
  onOpenMediaPicker,
  canViewMedia,
  mediaViewPermissionTitle,
  inlineError,
  onChange,
}: {
  field: CollectionField;
  value: string;
  collections: Collection[];
  currentCollectionId: string;
  records: CollectionRecord[];
  referenceRecordsByCollection: Record<string, ReferenceRecordOptionsState>;
  onOpenMediaPicker: (field: CollectionField) => void;
  canViewMedia: boolean;
  mediaViewPermissionTitle?: string;
  inlineError?: string | null;
  onChange: (value: string) => void;
}) {
  const selectedValues = value.split(',').map((item) => item.trim()).filter(Boolean);
  const targetCollection = field.referenceCollectionId
    ? collections.find((collection) => collection.id === field.referenceCollectionId) || null
    : null;
  const sameCollectionReference = targetCollection?.id === currentCollectionId;
  const targetReferenceState = targetCollection && !sameCollectionReference
    ? referenceRecordsByCollection[targetCollection.id]
    : null;
  const referenceOptions = sameCollectionReference
    ? records
    : targetReferenceState?.records || [];
  const optionIds = new Set(referenceOptions.map((record) => record.id));
  const fieldErrorId = inlineError ? `collections-record-field-error-${field.key}` : undefined;
  const errorProps = {
    'aria-invalid': Boolean(inlineError),
    'aria-describedby': fieldErrorId,
  };
  const requiredProps = field.required ? { 'aria-required': true } : {};
  const inputClassName = cn(
    'w-full rounded-lg border bg-background px-3 py-2',
    inlineError && 'border-destructive focus-visible:outline-destructive',
  );
  const tallInputClassName = cn(
    'min-h-24 w-full rounded-lg border bg-background px-3 py-2',
    inlineError && 'border-destructive focus-visible:outline-destructive',
  );
  const compactMonoTextareaClassName = cn(
    'min-h-20 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm',
    inlineError && 'border-destructive focus-visible:outline-destructive',
  );
  const monoTextareaClassName = cn(
    'min-h-24 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm',
    inlineError && 'border-destructive focus-visible:outline-destructive',
  );

  return (
    <div className="space-y-1 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium">{field.label}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{field.type}</span>
      </span>
      {field.helpText ? <span className="block text-xs leading-4 text-muted-foreground">{field.helpText}</span> : null}
      {field.type === 'boolean' ? (
        <select value={value || 'false'} onChange={(event) => onChange(event.target.value)} className={inputClassName} {...errorProps} {...requiredProps}>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : field.type === 'select' && field.options?.length ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} {...errorProps} {...requiredProps}>
          <option value="">Choose {field.label}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : field.type === 'tags' && field.options?.length ? (
        <select
          multiple
          value={selectedValues}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value).join(', '))}
          className={tallInputClassName}
          {...errorProps}
          {...requiredProps}
        >
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : field.type === 'reference' && targetCollection ? (
        <div className="grid gap-2">
          <select
            value={optionIds.has(value) ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
            {...errorProps}
            {...requiredProps}
            data-testid={`collections-record-reference-picker-${field.key}`}
            disabled={Boolean(targetReferenceState?.loading)}
          >
            <option value="">
              {targetReferenceState?.loading ? 'Loading records...' : `Choose ${targetCollection.name} record`}
            </option>
            {referenceOptions.map((record) => (
              <option key={record.id} value={record.id}>{record.slug} ({record.status})</option>
            ))}
          </select>
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
            {...errorProps}
            {...requiredProps}
            placeholder={`Or paste ${targetCollection.name} record ID`}
            data-testid={`collections-record-reference-manual-${field.key}`}
          />
        </div>
      ) : field.type === 'multiReference' && targetCollection ? (
        <div className="grid gap-2">
          <select
            multiple
            value={selectedValues.filter((item) => optionIds.has(item))}
            onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value).join(', '))}
            className={tallInputClassName}
            {...errorProps}
            {...requiredProps}
            data-testid={`collections-record-reference-picker-${field.key}`}
            disabled={Boolean(targetReferenceState?.loading)}
          >
            {referenceOptions.map((record) => (
              <option key={record.id} value={record.id}>{record.slug} ({record.status})</option>
            ))}
          </select>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={compactMonoTextareaClassName}
            {...errorProps}
            {...requiredProps}
            placeholder={`${targetCollection.name} record IDs separated by commas`}
            data-testid={`collections-record-reference-manual-${field.key}`}
          />
        </div>
      ) : field.type === 'richText' || field.type === 'json' || field.type === 'tags' || field.type === 'multiReference' ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={monoTextareaClassName}
          {...errorProps}
          {...requiredProps}
          placeholder={field.type === 'json' ? '{"key":"value"}' : field.type === 'multiReference' ? 'record-id-1, record-id-2' : undefined}
        />
      ) : field.type === 'image' || field.type === 'video' || field.type === 'file' ? (
        <div className="grid gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            {isCollectionMultiFileField(field) ? (
              <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={compactMonoTextareaClassName}
                {...errorProps}
                {...requiredProps}
                placeholder="Backy media IDs or external URLs, one per line"
                data-testid={`collections-record-field-${field.key}`}
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={inputClassName}
                {...errorProps}
                {...requiredProps}
                placeholder="Backy media ID or external URL"
                data-testid={`collections-record-field-${field.key}`}
              />
            )}
            <button
              type="button"
              onClick={() => onOpenMediaPicker(field)}
              disabled={!canViewMedia}
              title={!canViewMedia ? mediaViewPermissionTitle : undefined}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`collections-record-media-picker-${field.key}`}
            >
              <Upload className="h-4 w-4" />
              Choose media
            </button>
          </div>
          <span className="text-xs leading-4 text-muted-foreground">
            {isCollectionMultiFileField(field)
              ? 'Stores an ordered list of Backy media IDs from the central library; external URLs still work for custom frontends.'
              : 'Stores a Backy media ID from the central library; external URLs still work for custom frontends.'}
          </span>
        </div>
      ) : (
        <input
          type={collectionRecordInputType(field.type)}
          data-testid={`collections-record-field-${field.key}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
          {...errorProps}
          {...requiredProps}
        />
      )}
      {inlineError ? (
        <span
          id={fieldErrorId}
          className="block text-xs font-medium text-destructive"
          data-testid={`collections-record-field-error-${field.key}`}
        >
          {inlineError}
        </span>
      ) : null}
      {RELATION_FIELD_TYPES.includes(field.type) && targetReferenceState?.error ? (
        <span className="block text-xs leading-4 text-amber-600">
          {targetReferenceState.error}
        </span>
      ) : null}
      {RELATION_FIELD_TYPES.includes(field.type) && !targetCollection ? (
        <span className="block text-xs leading-4 text-muted-foreground">
          Map a reference collection in the schema to enable record choices.
        </span>
      ) : null}
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

function AuthoredTemplateComparePanel({
  kind,
  history,
  selectedVersionId,
  diff,
  onSelectedVersionIdChange,
}: {
  kind: 'list' | 'item';
  history: CollectionAuthoredDynamicTemplateVersion[];
  selectedVersionId: string;
  diff: CollectionAuthoredDynamicTemplateDiff | null;
  onSelectedVersionIdChange: (versionId: string) => void;
}) {
  const label = kind === 'list' ? 'List' : 'Item';

  return (
    <div
      className="space-y-2 border-t border-cyan-200 pt-2"
      data-testid={`collections-${kind}-template-compare`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-950">Compare active capture</div>
          <p className="mt-1 text-xs text-cyan-900/75">
            Review root element, page, canvas, and CSS differences before restoring or saving.
          </p>
        </div>
        <select
          value={selectedVersionId}
          onChange={(event) => onSelectedVersionIdChange(event.target.value)}
          disabled={history.length === 0}
          className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs text-cyan-950 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`collections-${kind}-template-compare-select`}
        >
          {history.length === 0 ? (
            <option value="">No versions</option>
          ) : history.map((version) => (
            <option key={version.id} value={version.id}>
              Version {version.version} · {formatDate(version.capturedAt)}
            </option>
          ))}
        </select>
      </div>

      {diff ? (
        <div className="rounded-md border border-cyan-200 bg-white/80 p-3 text-xs text-cyan-950">
          <div className="flex flex-wrap items-center gap-2" data-testid={`collections-${kind}-template-diff-summary`}>
            <Code2 className="h-3.5 w-3.5" />
            <span className="font-medium">{label} template diff</span>
            <span className={cn(
              'rounded-full px-2 py-0.5',
              diff.hasChanges ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-950',
            )}>
              {diff.summary}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <DiffMetric label="Active roots" value={`${diff.activeRootCount}`} />
            <DiffMetric label="Version roots" value={`${diff.versionRootCount}`} />
            <DiffMetric label="Changed roots" value={summarizeTemplateRootIds(diff.changedRootIds)} />
            <DiffMetric label="Added roots" value={summarizeTemplateRootIds(diff.addedRootIds)} />
            <DiffMetric label="Removed roots" value={summarizeTemplateRootIds(diff.removedRootIds)} />
            <DiffMetric label="Unchanged roots" value={`${diff.unchangedRootCount}`} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <DiffFlag label="Page" changed={diff.pageChanged} detail={`${diff.versionPageLabel} -> ${diff.activePageLabel}`} />
            <DiffFlag label="Canvas size" changed={diff.canvasSizeChanged} detail={diff.canvasSizeChanged ? 'Changed' : 'Unchanged'} />
            <DiffFlag label="Custom CSS" changed={diff.customCssChanged} detail={diff.customCssChanged ? 'Changed' : 'Unchanged'} />
            <DiffFlag label="Custom JS" changed={diff.customJsChanged} detail={diff.customJsChanged ? 'Changed' : 'Unchanged'} />
            <DiffFlag
              label="Design state"
              changed={diff.designStateChanged}
              detail={diff.designStateChanged ? summarizeTemplateRootIds(diff.designStateChangeLabels) : 'Unchanged'}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-cyan-200 bg-white/80 px-3 py-2 text-xs text-cyan-900/70">
          Capture a canvas and keep at least one history version to compare authored templates.
        </p>
      )}
    </div>
  );
}

function DiffMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-cyan-100 bg-cyan-50/50 px-2 py-1">
      <span className="block text-[11px] uppercase tracking-wide text-cyan-900/70">{label}</span>
      <span className="break-words font-medium text-cyan-950">{value}</span>
    </div>
  );
}

function DiffFlag({ label, changed, detail }: { label: string; changed: boolean; detail: string }) {
  return (
    <div className={cn(
      'rounded border px-2 py-1',
      changed ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950',
    )}>
      <span className="block text-[11px] uppercase tracking-wide opacity-75">{label}</span>
      <span className="break-words font-medium">{detail}</span>
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
