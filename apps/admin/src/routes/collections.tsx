import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
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
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
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
  importCollectionRecordsCsv,
  listCollectionRecords,
  listCollections,
  updateCollection,
  updateCollectionRecord,
  type Collection,
  type CollectionField,
  type CollectionFieldType,
  type CollectionPermissions,
  type CollectionRecord,
} from '@/lib/adminContentApi';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { useStore } from '@/stores/mockStore';
import { formatDate } from '@/lib/utils';

export const Route = createFileRoute('/collections')({
  component: CollectionsPage,
});

const DEFAULT_RECORD_PAGE_SIZE = 25;

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
] as const;

interface CollectionTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  useCase: string;
  permissions: CollectionPermissions;
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
    options: field.options ? [...field.options] : undefined,
    sortOrder: (index + 1) * 10,
  }))
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

type RecordStatusFilter = CollectionRecord['status'] | '';

function CollectionsPage() {
  const { sites } = useStore();
  const shortcutParams = useMemo(() => {
    if (typeof window === 'undefined') {
      return { siteId: '', collectionId: '', recordId: '' };
    }

    const params = new URLSearchParams(window.location.search);
    return {
      siteId: params.get('siteId') || '',
      collectionId: params.get('collectionId') || '',
      recordId: params.get('recordId') || '',
    };
  }, []);
  const [selectedSiteId, setSelectedSiteId] = useState(() => getSiteSelectionFromSearch(sites));
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    slug: '',
    listRoutePattern: '',
    routePattern: '',
    description: '',
    status: 'published' as Collection['status'],
    permissions: DEFAULT_PERMISSIONS,
    fields: [createEmptyField(10)],
  });
  const [recordForm, setRecordForm] = useState({
    slug: '',
    status: 'published' as CollectionRecord['status'],
    values: {} as Record<string, string>,
  });
  const [recordFilters, setRecordFilters] = useState({
    search: '',
    status: '' as RecordStatusFilter,
    fieldKey: '',
    fieldValue: '',
    sortBy: 'updatedAt',
    sortDirection: 'desc' as 'asc' | 'desc',
  });
  const [recordPagination, setRecordPagination] = useState({
    total: 0,
    limit: DEFAULT_RECORD_PAGE_SIZE,
    offset: 0,
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRecordsLoading, setIsRecordsLoading] = useState(false);
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isExportingRecords, setIsExportingRecords] = useState(false);
  const [isImportingRecords, setIsImportingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationDetails, setValidationDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCollectionDelete, setPendingCollectionDelete] = useState<Collection | null>(null);
  const [pendingRecordDelete, setPendingRecordDelete] = useState<CollectionRecord | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const shortcutRecordAppliedRef = useRef(false);

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || 'site-demo';
  const activeSiteSlug = activeSite?.slug || activeSiteId;
  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) || null,
    [collections, selectedCollectionId],
  );
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) || null,
    [records, selectedRecordId],
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
  const activeSchemaFields = activeCollection?.fields.length
    ? activeCollection.fields
    : collectionForm.fields.filter((field) => field.key.trim() && field.label.trim());
  const activeListRoutePath = activeCollection
    ? buildCollectionListRoutePath(activeCollection)
    : normalizeCollectionListRoutePattern(collectionForm.listRoutePattern, collectionForm.slug || 'collection');
  const activeItemRoutePath = activeCollection
    ? buildCollectionRecordRouteTemplate(activeCollection)
    : normalizeCollectionRoutePattern(collectionForm.routePattern, collectionForm.slug || 'collection');
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
      pages: '/pages',
      media: '/media',
      products: '/products',
      forms: '/forms',
      sites: '/sites',
      settings: '/settings',
    },
    export: {
      columns: COLLECTION_SCHEMA_EXPORT_COLUMNS,
    },
    frontendSystems: COLLECTION_FRONTEND_SYSTEMS,
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
      listRoutePattern: normalizeCollectionListRoutePattern(activeCollection.listRoutePattern, activeCollection.slug),
      routePattern: normalizeCollectionRoutePattern(activeCollection.routePattern, activeCollection.slug),
      listRoutePath: activeListRoutePath,
      itemRouteTemplate: activeItemRoutePath,
      publicApiReady: activeCollectionIsPublic,
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
    fieldHealth,
    publicCollectionsUrl,
    publicRecordBySlugUrl,
    publicRecordsUrl,
    recordFilters,
    recordPagination,
    records,
    selectedRecordIds,
  ]);
  const collectionHandoffText = useMemo(() => JSON.stringify(collectionHandoff, null, 2), [collectionHandoff]);

  const updateRecordFilters = (updates: Partial<typeof recordFilters>) => {
    setRecordFilters((prev) => ({ ...prev, ...updates }));
    setRecordPagination((prev) => ({ ...prev, offset: 0 }));
  };

  const toggleRecordSelection = (recordId: string, selected: boolean) => {
    setSelectedRecordIds((prev) => (
      selected
        ? [...new Set([...prev, recordId])]
        : prev.filter((id) => id !== recordId)
    ));
  };

  const togglePageRecordSelection = (selected: boolean) => {
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

  const copyCollectionApiText = async (value: string, label: string) => {
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

  const resetCollectionForm = () => {
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
      name: '',
      slug: '',
      listRoutePattern: '',
      routePattern: '',
      description: '',
      status: 'published',
      permissions: DEFAULT_PERMISSIONS,
      fields: [createEmptyField(10)],
    });
    setRecordForm({ slug: '', status: 'published', values: {} });
  };

  const applyCollectionTemplate = (template: CollectionTemplate) => {
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

  const selectCollection = (collection: Collection) => {
    setSelectedCollectionId(collection.id);
    setSelectedRecordId(null);
    setSelectedRecordIds([]);
    setRecordFilters((prev) => ({
      ...prev,
      fieldKey: '',
      fieldValue: '',
    }));
    setRecordPagination((prev) => ({
      ...prev,
      offset: 0,
    }));
    setCollectionForm({
      name: collection.name,
      slug: collection.slug,
      listRoutePattern: normalizeCollectionListRoutePattern(collection.listRoutePattern, collection.slug),
      routePattern: normalizeCollectionRoutePattern(collection.routePattern, collection.slug),
      description: collection.description || '',
      status: collection.status,
      permissions: collection.permissions,
      fields: collection.fields.length > 0 ? collection.fields : [createEmptyField(10)],
    });
    setRecordForm({ slug: '', status: 'published', values: {} });
  };

  const loadCollections = async () => {
    setIsLoading(true);
    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      const backendCollections = await listCollections(activeSiteId);
      setCollections(backendCollections);
      const nextSelected = backendCollections.find((collection) => collection.id === selectedCollectionId)
        || backendCollections.find((collection) => (
          collection.id === shortcutParams.collectionId ||
          collection.slug === shortcutParams.collectionId
        ))
        || backendCollections[0]
        || null;
      if (nextSelected) {
        selectCollection(nextSelected);
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
      if (!shortcutRecordAppliedRef.current && shortcutParams.recordId) {
        const shortcutRecord = result.records.find((record) => (
          record.id === shortcutParams.recordId ||
          record.slug === shortcutParams.recordId
        ));
        if (shortcutRecord) {
          setSelectedRecordId(shortcutRecord.id);
          shortcutRecordAppliedRef.current = true;
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

  useEffect(() => {
    void loadCollections();
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

  const handleCollectionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      const payload = {
        name: collectionForm.name.trim(),
        slug: collectionSlug,
        listRoutePattern: collectionForm.listRoutePattern.trim() || defaultCollectionListRoutePattern(collectionSlug),
        routePattern: collectionForm.routePattern.trim() || defaultCollectionRoutePattern(collectionSlug),
        description: collectionForm.description.trim() || null,
        status: collectionForm.status,
        permissions: collectionForm.permissions,
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
    } catch (saveError) {
      showApiError(saveError, 'Unable to save collection');
    } finally {
      setIsSavingCollection(false);
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {

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
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete collection');
    }
  };

  const handleRecordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCollection) return;

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
      if (activeCollection) {
        void loadRecords(activeCollection.id);
      }
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

    setError(null);
    setValidationDetails([]);
    setNotice(null);
    try {
      await deleteCollectionRecord(activeSiteId, activeCollection.id, record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      if (selectedRecordId === record.id) {
        setSelectedRecordId(null);
      }
      setPendingRecordDelete(null);
      void loadRecords(activeCollection.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete collection record');
    }
  };

  const handleBulkUpdateStatus = async (status: CollectionRecord['status']) => {
    if (!activeCollection || selectedRecordIds.length === 0) return;

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
    } catch (bulkError) {
      showApiError(bulkError, 'Unable to update selected collection records');
    }
  };

  const handleBulkDeleteRecords = async () => {
    if (!activeCollection || selectedRecordIds.length === 0) return;

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
      }
      setSelectedRecordIds([]);
      setPendingBulkDelete(false);
      setNotice(`${result.deleted} records deleted${result.skipped ? `, ${result.skipped} skipped` : ''}.`);
      void loadRecords(activeCollection.id);
    } catch (bulkError) {
      showApiError(bulkError, 'Unable to delete selected collection records');
    }
  };

  const handleExportRecords = async () => {
    if (!activeCollection) return;

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
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export collection records');
    } finally {
      setIsExportingRecords(false);
    }
  };

  const handleImportRecords = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeCollection) return;

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

  return (
    <PageShell
      title="Collections"
      description="Build structured CMS data for custom frontends and dynamic Backy pages."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadCollections()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            aria-label="Refresh collections"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={resetCollectionForm}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            aria-label="Create new collection"
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
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
              Copy manifest
            </button>
            <button
              type="button"
              onClick={downloadCollectionHandoff}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={downloadCollectionSchemaCsv}
              disabled={collections.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export schemas
            </button>
            <button
              type="button"
              onClick={() => void loadCollections()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={resetCollectionForm}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
              <Link
                key={surface.key}
                to={surface.route}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
              </Link>
            ))}
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
                className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
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
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            aria-label={`Copy ${activeCollectionIsPublic ? 'public' : 'admin'} records URL`}
          >
            <Copy className="h-4 w-4" />
            {activeCollectionIsPublic ? 'Copy public records' : 'Copy admin records'}
          </button>
          <button
            type="button"
            onClick={() => void copyCollectionApiText(collectionHandoffText, 'Collections handoff manifest')}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Copy className="h-4 w-4" />
            Copy manifest
          </button>
          <button
            type="button"
            onClick={downloadCollectionSchemaCsv}
            disabled={collections.length === 0}
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
          onChange={(event) => setSelectedSiteId(event.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
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
                onClick={() => selectCollection(collection)}
                className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted ${
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
          <form id="collections-schema" onSubmit={handleCollectionSubmit} className="rounded-lg border border-border bg-card scroll-mt-24">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Schema builder</h2>
              <div className="flex items-center gap-2">
                {activeCollection && (
                  <button
                    type="button"
                    onClick={() => setPendingCollectionDelete(activeCollection)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingCollection}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {isSavingCollection ? 'Saving...' : 'Save schema'}
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Name</span>
                <input
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
                    description="Planned after public auth scopes."
                    checked={collectionForm.permissions.publicUpdate}
                    disabled
                  />
                  <PermissionSwitch
                    label="Visitor delete"
                    description="Planned after public auth scopes."
                    checked={collectionForm.permissions.publicDelete}
                    disabled
                  />
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

            <div className="border-t border-border">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold">Fields</h3>
                <button
                  type="button"
                  onClick={() => setCollectionForm((prev) => ({
                    ...prev,
                    fields: [...prev.fields, createEmptyField((prev.fields.length + 1) * 10)],
                  }))}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
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
                            disabled={collectionForm.fields.length === 1}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
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
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
                    disabled={isImportingRecords}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                    aria-label="Import collection records CSV"
                  >
                    <Upload className="h-4 w-4" />
                    {isImportingRecords ? 'Importing...' : 'Import CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportRecords()}
                    disabled={isExportingRecords}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {isExportingRecords ? 'Exporting...' : 'Export CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecordId(null);
                      setRecordForm({ slug: '', status: 'published', values: {} });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
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
                    className="w-full rounded-lg border bg-background px-3 py-2"
                    placeholder="Search values"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Status</span>
                  <select
                    value={recordFilters.status}
                    onChange={(event) => updateRecordFilters({
                      status: event.target.value as RecordStatusFilter,
                    })}
                    className="w-full rounded-lg border bg-background px-3 py-2"
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
                    onChange={(event) => updateRecordFilters({
                      fieldKey: event.target.value,
                      fieldValue: event.target.value ? recordFilters.fieldValue : '',
                    })}
                    className="w-full rounded-lg border bg-background px-3 py-2"
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
                    disabled={!recordFilters.fieldKey}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:opacity-60"
                    placeholder="Contains"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Sort by</span>
                  <select
                    value={recordFilters.sortBy}
                    onChange={(event) => updateRecordFilters({ sortBy: event.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2"
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
                    onChange={(event) => updateRecordFilters({
                      sortDirection: event.target.value === 'asc' ? 'asc' : 'desc',
                    })}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </label>
              </div>

              {selectedRecordIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 text-sm">
                  <span className="font-medium">
                    {selectedRecordIds.length} selected
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('published')}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('draft')}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background"
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateStatus('archived')}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background"
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRecordIds([])}
                      className="rounded-lg border border-border px-3 py-2 hover:bg-background"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingBulkDelete(true)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50"
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
                                onChange={(event) => toggleRecordSelection(record.id, event.target.checked)}
                                aria-label={`Select record ${record.slug}`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setSelectedRecordId(record.id)}
                                className="font-medium text-foreground hover:text-primary"
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
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {routePath}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => setPendingRecordDelete(record)}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"
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
                          onChange={(event) => setRecordPagination((prev) => ({
                            ...prev,
                            limit: Number(event.target.value),
                            offset: 0,
                          }))}
                          className="rounded-lg border bg-background px-2 py-1 text-foreground"
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
                        onClick={() => setRecordPagination((prev) => ({
                          ...prev,
                          offset: Math.max(0, prev.offset - prev.limit),
                        }))}
                        disabled={recordPagination.offset === 0 || isRecordsLoading}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                        aria-label="Previous records page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordPagination((prev) => ({
                          ...prev,
                          offset: prev.offset + prev.limit,
                        }))}
                        disabled={!recordPagination.hasMore || isRecordsLoading}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                        aria-label="Next records page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleRecordSubmit} className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{selectedRecord ? 'Edit record' : 'Create record'}</h3>
                    <button
                      type="submit"
                      disabled={isSavingRecord}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCollection(pendingCollectionDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Delete collection
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteRecord(pendingRecordDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Delete record
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDeleteRecords()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Delete records
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

function CollectionRoutePreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <code className="mt-1 block truncate font-mono text-xs text-foreground">{value || 'Not configured'}</code>
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
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-24 items-start gap-3 rounded-lg border border-border bg-background p-3 ${
        disabled ? 'cursor-not-allowed opacity-65' : 'cursor-pointer hover:bg-muted/40'
      }`}
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
