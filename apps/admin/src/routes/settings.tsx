/**
 * ============================================================================
 * BACKY CMS - SETTINGS PAGE
 * ============================================================================
 *
 * The settings page for managing global CMS settings, site settings,
 * user preferences, and integrations.
 *
 * @module SettingsPage
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Palette,
  Globe,
  Shield,
  Database,
  Bell,
  Save,
  Check,
  Code,
  Server,
  ExternalLink,
  History,
  RefreshCw,
  Cloud,
  Rocket,
  CheckCircle2,
  Copy,
  Download,
  MoreHorizontal,
  CreditCard,
  ShoppingCart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import { useAuthStore } from '@/stores/authStore';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { getLocalBackendOrigin as getLocalDevBackendOrigin } from '@/lib/localBackendOrigin';
import type { AdminSession } from '@/lib/adminAuthApi';
import { useStore, type DeliveryMode, type Site } from '@/stores/mockStore';
import {
  getAdminSiteSettingsScope,
  getSettings,
  getUserPermissions,
  issueSettingsAdminApiKey,
  listSites,
  listAdminAuditLogs,
  regenerateSettingsApiKeys,
  revokeSettingsAdminApiKey,
  runSettingsStorageCredentialRotationProbe,
  runSettingsStorageProvisioningProbe,
  runSettingsStorageSecretManager,
  testSettingsNotificationWebhook,
  updateAdminSiteSettingsScope,
  validateSettingsInfrastructure,
  type AdminAuditLog,
  type AdminSiteSettingsScope,
  type AdminUserPermissionMatrix,
  type IssuedAdminApiKey,
  type SettingsDeploymentHistoryEntry,
  type SettingsNotificationWebhookDeliveryResult,
  type SiteSettingsInput,
  type SettingsInfrastructureDiagnostic,
  type SettingsStorageCredentialRotationProbeResult,
  type SettingsStorageProvisioningResult,
  type SettingsStorageSecretManagerResult,
  updateSettings as updateBackendSettings,
} from '@/lib/adminContentApi';

// ============================================
// TABS
// ============================================

type SettingsTab = 'general' | 'appearance' | 'seo' | 'delivery' | 'infrastructure' | 'commerce' | 'notifications' | 'security';
type SettingsPermissionKey = 'settings.view' | 'settings.configure' | 'settings.manageKeys' | 'media.configure' | 'activity.export' | 'sites.view' | 'sites.configure';

const SETTINGS_PERMISSION_ROLE_DEFAULTS: Record<SettingsPermissionKey, Array<'owner' | 'admin' | 'editor' | 'viewer'>> = {
  'settings.view': ['owner', 'admin'],
  'settings.configure': ['owner', 'admin'],
  'settings.manageKeys': ['owner'],
  'media.configure': ['owner', 'admin'],
  'activity.export': ['owner', 'admin'],
  'sites.view': ['owner', 'admin', 'editor', 'viewer'],
  'sites.configure': ['owner', 'admin'],
};

const isSettingsPermissionAllowed = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentUser: { role: 'owner' | 'admin' | 'editor' | 'viewer' } | null | undefined,
  key: SettingsPermissionKey,
) => {
  if (isAdminPermissionAllowed(permissionMatrix, currentUser, key, SETTINGS_PERMISSION_ROLE_DEFAULTS)) {
    return true;
  }

  return !permissionMatrix && Boolean(currentUser && SETTINGS_PERMISSION_ROLE_DEFAULTS[key].includes(currentUser.role));
};

interface SettingsSearch {
  tab?: SettingsTab;
}

const SETTINGS_TAB_IDS: SettingsTab[] = ['general', 'appearance', 'seo', 'delivery', 'infrastructure', 'commerce', 'notifications', 'security'];

const isSettingsTab = (value: unknown): value is SettingsTab => (
  typeof value === 'string' && SETTINGS_TAB_IDS.includes(value as SettingsTab)
);

// ============================================
// ROUTE DEFINITION
// ============================================

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: isSettingsTab(search.tab) ? search.tab : undefined,
  }),
  component: SettingsPage,
});

const TABS: Array<SegmentedTabItem<SettingsTab>> = [
  { id: 'general', name: 'General', icon: Globe },
  { id: 'appearance', name: 'Appearance', icon: Palette },
  { id: 'seo', name: 'SEO', icon: Database },
  { id: 'delivery', name: 'Delivery', icon: Code },
  { id: 'infrastructure', name: 'Infrastructure', icon: Cloud },
  { id: 'commerce', name: 'Commerce', icon: ShoppingCart },
  { id: 'notifications', name: 'Notifications', icon: Bell },
  { id: 'security', name: 'Security', icon: Shield },
];

const SETTINGS_WORKBAR_SECTIONS = [
  { id: 'settings-command-center', label: 'Command center' },
  { id: 'settings-tabs', label: 'Sections' },
  { id: 'settings-tab-content', label: 'Active controls' },
] as const;

type ApiEndpoint = {
  method: string;
  path: string;
  description: string;
};

type ResponsibilityArea = {
  area: string;
  owner: 'Backy in-house' | 'Supabase connection' | 'Vercel connection';
  controlSurface: string;
  runtimeSource: string;
  frontendImpact: string;
};

type FrontendApiCapability = {
  area: string;
  status: 'ready' | 'partial' | 'planned';
  contract: string;
  controls: string;
  stillNeeded: string;
};

type SettingsDraftSnapshot = {
  deliveryMode: DeliveryMode;
  auth?: SiteSettingsInput['auth'];
  integrations: NonNullable<SiteSettingsInput['integrations']>;
};

type SiteScopedSettingsDraft = {
  titleTemplate: string;
  defaultDescription: string;
  googleAnalyticsId: string;
  plausibleDomain: string;
  twitter: string;
  github: string;
  linkedin: string;
  defaultLocale: string;
  localeStrategy: 'none' | 'path-prefix' | 'domain';
  locales: string;
  moderationMode: 'manual' | 'auto-approve';
  blockedTerms: string;
};

type SettingsValidationIssue = {
  tab: SettingsTab;
  label: string;
  detail: string;
  severity: 'error' | 'warning';
};

type SettingsLaunchReadinessStatus = 'ready' | 'attention' | 'blocked';

type SettingsLaunchReadinessCheck = {
  key: string;
  label: string;
  status: SettingsLaunchReadinessStatus;
  detail: string;
  nextAction: string;
  ownerSurface: SettingsTab | 'release';
  gate?: string;
};

type SettingsLaunchActionPlan = {
  schemaVersion: 'backy.settings-launch-action-plan.v1';
  nextAction: string;
  blockingChecks: string[];
  attentionChecks: string[];
  recommendedCommands: string[];
  ownerSurfaces: Array<SettingsTab | 'release'>;
};

type BackyCompletionGateStatus = 'ready-to-run' | 'blocked-missing-inputs';

type BackyCompletionGate = {
  key: 'forms-postgres' | 'sdk-postgres' | 'settings-provider-certification' | 'commerce-provider-certification';
  label: string;
  status: BackyCompletionGateStatus;
  command: string;
  workflow: string;
  affectedSurfaces: string[];
  requiredEnvAliases: string[];
  runtime: Record<string, unknown>;
};

type BackyCompletionEvidenceArtifact = {
  key: string;
  label: string;
  workflow: string;
  alternateWorkflows: string[];
  artifactName: string;
  path: string;
  schemaVersion: string;
  producerEnv: string;
  requiredForReady: true;
  includesSecretValues: false;
};

type BackyCompletionArtifactVerifier = {
  command: string;
  requiredEnv: string;
  pathEnv: string;
  schemaVersion: string;
  validates: string[];
  freshnessWindow: {
    maxAgeHoursEnv: string;
    defaultMaxAgeHours: number;
    futureSkewMinutesEnv: string;
    defaultFutureSkewMinutes: number;
  };
  includesSecretValues: false;
};

type BackyCertifiedCompletionGate = {
  key: 'forms-postgres' | 'sdk-postgres';
  label: string;
  status: 'certified';
  command: string;
  workflow: string;
  affectedSurfaces: string[];
  certifiedAt: string;
  evidence: string;
  runtime: Record<string, unknown>;
};

type BackyCompletionSurfaceRunbook = {
  key: 'settings' | 'settings-admin-apis' | 'products' | 'orders';
  label: string;
  gate: 'settings-provider-certification' | 'commerce-provider-certification';
  command: string;
  preflight: string;
  workflow: string;
  targetInputs: string[];
  evidencePacketSchema:
    | 'backy.settings-provider-certification-evidence-packet.v1'
    | 'backy.commerce-provider-certification-evidence-packet.v1'
    | 'backy.order-provider-certification-evidence-packet.v1';
  evidenceApi: string;
  evidenceUiPanel: string;
  sourceOnlyGuard: string;
  proofSources: string[];
  expectedArtifacts: string[];
  evidenceArtifacts: BackyCompletionEvidenceArtifact[];
  artifactVerifier: BackyCompletionArtifactVerifier;
  runtime: Record<string, unknown>;
  secretBoundary: {
    includesSecretValues: false;
    excludes: string[];
  };
  nextAction: string;
};

const BACKY_COMPLETION_AUDIT = {
  source: 'specs/page-completion-audit/backy-page-surface-audit.md',
  ready: 41,
  partial: 4,
  prototype: 0,
  missing: 0,
  total: 45,
  readyPercent: 91,
} as const;

const BACKY_COMPLETION_SURFACES = [
  { key: 'products', label: '/products', status: 'partial', blocker: 'commerce-provider-certification', gate: 'npm run ci:commerce-provider-certification' },
  { key: 'orders', label: '/orders', status: 'partial', blocker: 'commerce-provider-certification', gate: 'npm run ci:commerce-provider-certification' },
  { key: 'settings', label: '/settings', status: 'partial', blocker: 'settings-provider-certification', gate: 'npm run ci:settings-provider-certification' },
  { key: 'settings-admin-apis', label: 'Settings admin APIs', status: 'partial', blocker: 'settings-provider-certification', gate: 'npm run ci:settings-provider-certification' },
] as const;

const SETTINGS_COMPLETION_EVIDENCE_ARTIFACTS: BackyCompletionEvidenceArtifact[] = [
  {
    key: 'settings-provider-certification-json',
    label: 'Settings provider certification evidence',
    workflow: '.github/workflows/settings-provider-certification.yml',
    alternateWorkflows: ['.github/workflows/backy-release-certification.yml'],
    artifactName: 'backy-settings-provider-certification-evidence',
    path: 'artifacts/backy-settings-provider-certification.json',
    schemaVersion: 'backy.settings-provider-certification-artifact.v1',
    producerEnv: 'BACKY_SETTINGS_CERTIFICATION_OUTPUT',
    requiredForReady: true,
    includesSecretValues: false,
  },
];

const COMMERCE_COMPLETION_EVIDENCE_ARTIFACTS: BackyCompletionEvidenceArtifact[] = [
  {
    key: 'commerce-provider-certification-json',
    label: 'Commerce provider certification evidence',
    workflow: '.github/workflows/commerce-provider-certification.yml',
    alternateWorkflows: ['.github/workflows/settings-provider-certification.yml', '.github/workflows/backy-release-certification.yml'],
    artifactName: 'backy-commerce-provider-certification-evidence',
    path: 'artifacts/backy-commerce-provider-certification.json',
    schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    producerEnv: 'BACKY_COMMERCE_CERTIFICATION_OUTPUT',
    requiredForReady: true,
    includesSecretValues: false,
  },
];

const COMPLETION_ARTIFACT_FRESHNESS_WINDOW = {
  maxAgeHoursEnv: 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS',
  defaultMaxAgeHours: 168,
  futureSkewMinutesEnv: 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES',
  defaultFutureSkewMinutes: 15,
};

const SETTINGS_COMPLETION_ARTIFACT_VERIFIER: BackyCompletionArtifactVerifier = {
  command: 'npm run doctor:release-certification',
  requiredEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
  pathEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT',
  schemaVersion: 'backy.settings-provider-certification-artifact.v1',
  validates: [
    'file exists',
    'valid JSON',
    'ok: true',
    'artifact schema version',
    'certifiedAtReady',
    'artifactFreshReady',
    'artifactAgeHours',
    'artifactMaxAgeHours',
    'artifactFutureSkewMinutes',
    'no-secret boundary',
    'no raw secret-like values',
    'no forbidden artifact field names or credential URLs',
    'apiHandoffs.settingsAdminApi present',
    'apiHandoffs.siteScopedSettingsApi present',
    'settingsCompletionStatusReady',
  ],
  freshnessWindow: COMPLETION_ARTIFACT_FRESHNESS_WINDOW,
  includesSecretValues: false,
};

const COMMERCE_COMPLETION_ARTIFACT_VERIFIER: BackyCompletionArtifactVerifier = {
  command: 'npm run doctor:release-certification',
  requiredEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
  pathEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT',
  schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
  validates: [
    'file exists',
    'valid JSON',
    'ok: true',
    'artifact schema version',
    'certifiedAtReady',
    'artifactFreshReady',
    'artifactAgeHours',
    'artifactMaxAgeHours',
    'artifactFutureSkewMinutes',
    'no-secret boundary',
    'no raw secret-like values',
    'no forbidden artifact field names or credential URLs',
    'apiHandoffs.publicApis present',
    'commerceArtifactSiteTargetReady',
    'commerceArtifactTargetSiteId',
    'commerceArtifactSiteSelectorEnvReady',
    'commerceArtifactSiteSelectorEnv',
    'productApiHandoffReady',
    'orderApiHandoffReady',
  ],
  freshnessWindow: COMPLETION_ARTIFACT_FRESHNESS_WINDOW,
  includesSecretValues: false,
};

const DELIVERY_OPTIONS: Array<{
  id: DeliveryMode;
  title: string;
  description: string;
}> = [
  {
    id: 'managed-hosting',
    title: 'Managed rendering (Backy-generated pages)',
    description:
      'Backy generates pages and site output for you. Publish in the editor and serve from Backy.',
  },
  {
    id: 'custom-frontend',
    title: 'Custom frontend (headless API mode)',
    description:
      'Use your own frontend and consume Backy public APIs for pages, products, forms, media, comments, and dynamic data.',
  },
];

const PUBLIC_API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET',
    path: '/sites/:identifier',
    description: 'Resolve a site by slug, custom domain, or identifier.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/manifest',
    description: 'Fetch the frontend discovery manifest: routes, capabilities, schemas, and module endpoints.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/resolve?path=/',
    description: 'Resolve a public route to its content type, canonical path, and render URL.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/render?path=/',
    description: 'Fetch the render payload for any published page, blog post, or dynamic collection route.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/pages',
    description: 'List published pages for navigation, sitemaps, and frontend page indexes.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/navigation',
    description: 'Read primary/footer navigation structures for custom frontends.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog?status=published',
    description: 'List published blog posts.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/categories',
    description: 'Fetch blog categories for filters, archive pages, and editorial navigation.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/tags',
    description: 'Fetch blog tags for filters, topic pages, and custom frontend chips.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media?type=image',
    description: 'List public media assets for custom frontends and design systems.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media/fonts',
    description: 'Fetch the public font manifest for frontend typography loading.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media/:mediaId/file',
    description: 'Deliver a media file; private files require a signed URL.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections',
    description: 'List public dynamic collections that can drive repeatable frontend sections.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/:collectionId/records?status=published',
    description: 'Fetch public collection records for listings, catalogs, and structured content.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/products/records?status=published',
    description: 'Fetch published product catalog records for storefront grids and product detail pages.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/products/records?slug=:slug',
    description: 'Resolve a single public product by slug for a custom storefront.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/commerce/catalog',
    description: 'Fetch normalized storefront catalog data with product facets, filters, readiness, and pagination.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/commerce/catalog?slug=:slug',
    description: 'Resolve one normalized storefront product by slug.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/commerce/orders',
    description: 'Fetch the public order-intake contract before wiring a custom checkout.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/commerce/orders',
    description: 'Create a private Backy order from a public cart while keeping the raw orders collection private.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/reusable-sections',
    description: 'Read reusable section definitions for shared headers, footers, and repeatable design blocks.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/forms/:formId/definition',
    description: 'Fetch a cacheable public form definition without submissions or private contacts.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/forms/:formId/submissions',
    description: 'Submit form payloads with optional anti-spam metadata.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/pages/:pageId/comments?status=approved',
    description: 'Read approved page comments.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/pages/:pageId/comments',
    description: 'Submit a page comment.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/:postId/comments?status=approved',
    description: 'Read approved blog post comments.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/blog/:postId/comments',
    description: 'Submit a blog post comment.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/comments/report-reasons',
    description: 'Read the supported report/block reason taxonomy.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/comments/:commentId/report',
    description: 'Report a public comment for moderation.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/seo?format=sitemap',
    description: 'Fetch generated SEO metadata, sitemap, or robots output.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/openapi',
    description: 'Download the generated OpenAPI contract for this site.',
  },
];

const ADMIN_API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET',
    path: '/sites',
    description: 'List sites for the authenticated admin workspace.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/settings',
    description: 'Read the site-scoped Settings envelope for site-owned SEO, analytics, social, comment, navigation, domain, deployment, billing, webhook, and frontend-design controls.',
  },
  {
    method: 'PATCH',
    path: '/sites/:siteId/settings',
    description: 'Patch allowlisted site-owned Settings sections without mutating global workspace defaults.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/pages',
    description: 'Read pages for site management.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/pages',
    description: 'Create or update page payloads.',
  },
  {
    method: 'PATCH',
    path: '/sites/:siteId/pages/:pageId',
    description: 'Patch page settings, content, or status.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog',
    description: 'List and manage blog posts for the active site.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media',
    description: 'List media assets, folders, metadata, bindings, and delivery state.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/media',
    description: 'Upload a media asset for pages, blog posts, products, or custom frontends.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections',
    description: 'Manage collection schemas used for catalogs, listings, and dynamic pages.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/:collectionId/records',
    description: 'List records for products, directories, portfolios, and any custom object type.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/forms',
    description: 'List forms and review submissions.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/forms/:formId/contacts',
    description: 'Review private contacts captured by a public registration, contact, or inquiry form.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/comments?status=pending',
    description: 'Moderate page and blog comments from a custom admin frontend.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/products/records',
    description: 'Manage sellable product catalog records and storefront publishing state.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/orders/records',
    description: 'Manage private order records, payment state, fulfillment, refunds, and customer support data.',
  },
  {
    method: 'GET',
    path: '/users',
    description: 'List admin collaborators, roles, lifecycle state, and access metadata.',
  },
];

const PLATFORM_RESPONSIBILITIES: ResponsibilityArea[] = [
  {
    area: 'CMS data and page editor',
    owner: 'Backy in-house',
    controlSurface: 'Pages, Blog, Collections, reusable sections, canvas editor',
    runtimeSource: 'Backy APIs and repository layer',
    frontendImpact: 'Controls every route, component tree, SEO payload, and render payload a frontend consumes.',
  },
  {
    area: 'Forms, contacts, comments, and users',
    owner: 'Backy in-house',
    controlSurface: 'Forms, Contacts, Comments, Users, Notifications',
    runtimeSource: 'Backy public/admin APIs with audit-ready moderation and exports',
    frontendImpact: 'Powers registrations, lead capture, comments, team access, and workflow alerts.',
  },
  {
    area: 'Commerce and selling',
    owner: 'Backy in-house',
    controlSurface: 'Products, Orders, checkout handoff fields, refunds, fulfillment, inventory, and exports',
    runtimeSource: 'Backy collection APIs with public product delivery and private order operations',
    frontendImpact: 'Lets custom storefronts render products publicly while order/customer/payment data remains admin-only.',
  },
  {
    area: 'Media and file delivery',
    owner: 'Backy in-house',
    controlSurface: 'Media library, folders, tags, visibility, transforms, font assets',
    runtimeSource: 'Configured storage provider with Backy metadata and signed/public delivery APIs',
    frontendImpact: 'Lets any frontend request images, files, fonts, and responsive transforms from Backy contracts.',
  },
  {
    area: 'Database persistence',
    owner: 'Supabase connection',
    controlSurface: 'Infrastructure metadata and runtime env checks',
    runtimeSource: 'Supabase/Postgres environment variables and repository runtime',
    frontendImpact: 'Moves Backy data from demo/local runtime into a hosted database without exposing secrets.',
  },
  {
    area: 'Hosting and deploy workflow',
    owner: 'Vercel connection',
    controlSurface: 'Infrastructure metadata, domains, preview deploy preference, production URL',
    runtimeSource: 'Vercel deployment environment and project metadata',
    frontendImpact: 'Hosts Backy and custom frontends while keeping domains and preview behavior visible in Settings.',
  },
];

const PLATFORM_BACKLOG = [
  {
    item: 'Checkout/provider orchestration',
    status: 'product/order controls, checkout-session handoff, quote totals, webhook settlement, manual reconciliation repair, and platform scheduled reconciliation exist; provider API execution still needs deeper backend workflows',
  },
  {
    item: 'Supabase auth adapter',
    status: 'metadata and env detection exist; direct auth provider workflow is not finished yet',
  },
  {
    item: 'One-click Vercel deploy orchestration',
    status: 'project/domain metadata exists; deploy execution should remain a separate connected workflow',
  },
] as const;

const SETTINGS_PROVIDER_CERTIFICATION_GROUPS = [
  {
    family: 'Database and Supabase',
    providers: ['Supabase/Postgres', 'Supabase Auth', 'Supabase Storage'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'BACKY_DATABASE_URL or DATABASE_URL',
      'BACKY_SUPABASE_URL or SUPABASE_URL',
      'BACKY_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY',
      'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
    ],
    evidence: 'Configured runtime diagnostics plus disposable database/storage/auth provider checks.',
  },
  {
    family: 'Storage and media delivery',
    providers: ['Local storage', 'Supabase Storage', 'S3/R2-compatible storage', 'Media scanner'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER',
      'BACKY_SUPABASE_STORAGE_BUCKET or BACKY_STORAGE_BUCKET',
      'BACKY_S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID',
      'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY',
      'BACKY_S3_REGION or AWS_REGION',
      'BACKY_MEDIA_SCAN_PROVIDER',
    ],
    evidence: 'Storage provisioning, read/write/list/stat probes, scanner readiness, and replacement credential rotation checks.',
  },
  {
    family: 'Vercel deployment and secrets',
    providers: ['Vercel project', 'Vercel team', 'Vercel domains', 'Vercel env secret manager'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'VERCEL_TOKEN or BACKY_VERCEL_TOKEN',
      'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID',
      'VERCEL_TEAM_ID or BACKY_VERCEL_TEAM_ID',
      'VERCEL_API_BASE_URL or BACKY_VERCEL_API_BASE_URL',
    ],
    evidence: 'Project metadata, deployment diagnostics, and non-secret env secret-manager planning evidence.',
  },
  {
    family: 'Notifications',
    providers: ['Webhook', 'Resend', 'SMTP', 'Local outbox'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
      'BACKY_RESEND_API_KEY or RESEND_API_KEY',
      'BACKY_SMTP_HOST or SMTP_HOST',
      'BACKY_SMTP_USER or SMTP_USER',
      'BACKY_SMTP_PASSWORD or SMTP_PASSWORD',
    ],
    evidence: 'Configured provider readiness plus test-notification delivery proof for the selected channel.',
  },
  {
    family: 'Public API and custom frontend CORS',
    providers: ['Backy Public API', 'Custom frontend origin', 'Browser CORS preflight'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'BACKY_CORS_ALLOWED_ORIGINS',
      'BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN',
    ],
    evidence: 'Exact custom frontend origin, OPTIONS preflight, GET origin echo, and exposed Backy contract headers.',
  },
  {
    family: 'Commerce providers',
    providers: ['Stripe', 'TaxJar', 'Avalara', 'EasyPost', 'Shippo', 'PayPal', 'Paddle', 'Square', 'Adyen', 'Mollie', 'Razorpay', 'Shopify', 'BigCommerce', 'WooCommerce', 'Etsy', 'Magento'],
    gate: 'npm run ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
      'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
      'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
      'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
      'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
      'provider-specific catalog/payment credentials',
    ],
    evidence: 'Payment, tax, shipping, discount, catalog, subscription, refund, and webhook provider readiness for selected live families.',
  },
] as const;
const SETTINGS_PROVIDER_CERTIFICATION_SCENARIOS = [
  {
    key: 'database-supabase',
    label: 'Database and Supabase',
    expectedEvidence: ['database runtime readiness', 'Supabase project metadata', 'service-role alias readiness'],
    nextAction: 'Configure the disposable Supabase/Postgres target and Supabase runtime aliases before running provider certification.',
  },
  {
    key: 'storage-media',
    label: 'Storage and media delivery',
    expectedEvidence: ['storage provider readiness', 'bucket/path metadata', 'media scanner readiness'],
    nextAction: 'Run storage provisioning and scanner checks for the selected local, Supabase, or S3-compatible provider.',
  },
  {
    key: 'vercel-deployment',
    label: 'Vercel deployment and secrets',
    expectedEvidence: ['project id', 'team/project target', 'env secret planning evidence'],
    nextAction: 'Attach Vercel project/team metadata and run the Settings provider certification gate with Vercel selectors.',
  },
  {
    key: 'notification-delivery',
    label: 'Notification delivery',
    expectedEvidence: ['selected provider', 'test delivery result', 'retry/audit evidence'],
    nextAction: 'Configure webhook, Resend, SMTP, or local-outbox delivery and capture a non-secret test notification result.',
  },
  {
    key: 'commerce-provider-bridge',
    label: 'Commerce provider bridge',
    expectedEvidence: ['commerce provider family', 'webhook secret alias readiness', 'nested commerce gate'],
    nextAction: 'Select commerce provider families and run the nested commerce certification gate when Settings owns commerce runtime readiness.',
  },
  {
    key: 'public-api-cors',
    label: 'Public API and CORS',
    expectedEvidence: ['allowed origins', 'exposed Backy headers', 'custom frontend API boundary'],
    nextAction: 'Set exact custom frontend origins through BACKY_CORS_ALLOWED_ORIGINS and verify exposed Backy contract headers.',
  },
  {
    key: 'interactive-components',
    label: 'Interactive component sandbox',
    expectedEvidence: ['registry runtime', 'sandbox policy', 'custom-code capability state'],
    nextAction: 'Verify interactive registry and sandbox runtime diagnostics before launching custom code components.',
  },
  {
    key: 'release-certification-readiness',
    label: 'Release certification readiness',
    expectedEvidence: ['release doctor output', 'missing alias list', 'provider family selectors'],
    nextAction: 'Run the release doctor with Settings provider certification required and attach the non-secret summary.',
  },
] as const;

type SettingsCertificationStorageProvider = 'auto' | 'local' | 's3' | 'supabase';
type SettingsCertificationNotificationProvider = 'auto' | 'webhook' | 'http-endpoint' | 'resend' | 'smtp' | 'local-outbox';

type SettingsCertificationCommandOptions = {
  certifyStorage: boolean;
  storageProvider: SettingsCertificationStorageProvider;
  certifyRotation: boolean;
  certifyVercelSecrets: boolean;
  vercelProjectId: string;
  vercelTeamId: string;
  certifyNotification: boolean;
  notificationProvider: SettingsCertificationNotificationProvider;
  certifyPublicApiCors: boolean;
  publicApiOrigin: string;
  siteId: string;
  certifyCommerce: boolean;
  externalBaseUrl: string;
  includeReleaseDoctor: boolean;
};

const SETTINGS_CERTIFICATION_STORAGE_PROVIDER_OPTIONS: Array<{
  value: SettingsCertificationStorageProvider;
  label: string;
  description: string;
}> = [
  { value: 'auto', label: 'Auto detect', description: 'Use BACKY_STORAGE_PROVIDER/BACKY_MEDIA_STORAGE_PROVIDER.' },
  { value: 'local', label: 'Local storage', description: 'Accept the local adapter for local certification.' },
  { value: 's3', label: 'S3/R2 compatible', description: 'Require S3-compatible runtime credentials.' },
  { value: 'supabase', label: 'Supabase storage', description: 'Require Supabase storage runtime credentials.' },
];

const SETTINGS_CERTIFICATION_NOTIFICATION_PROVIDER_OPTIONS: Array<{
  value: SettingsCertificationNotificationProvider;
  label: string;
  description: string;
}> = [
  { value: 'auto', label: 'Auto detect', description: 'Infer from the configured notification runtime.' },
  { value: 'webhook', label: 'Webhook capture', description: 'Use the built-in capture server for delivery proof.' },
  { value: 'http-endpoint', label: 'HTTP endpoint', description: 'Require an HTTP delivery endpoint alias.' },
  { value: 'resend', label: 'Resend', description: 'Require Resend provider credentials.' },
  { value: 'smtp', label: 'SMTP', description: 'Require SMTP host and auth aliases.' },
  { value: 'local-outbox', label: 'Local outbox', description: 'Accept local outbox delivery readiness.' },
];

const DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS = {
  certifyStorage: true,
  storageProvider: 'auto',
  certifyRotation: false,
  certifyVercelSecrets: false,
  vercelProjectId: '',
  vercelTeamId: '',
  certifyNotification: true,
  notificationProvider: 'auto',
  certifyPublicApiCors: true,
  publicApiOrigin: '',
  siteId: 'site-demo',
  certifyCommerce: true,
  externalBaseUrl: '',
  includeReleaseDoctor: true,
} satisfies SettingsCertificationCommandOptions;

const uniqueTextValues = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const quoteShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
const quoteEnvTemplateValue = (value: string): string => (
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : quoteShellValue(value)
);

const boolEnv = (value: boolean): '1' | '0' => (value ? '1' : '0');

const missingInputsFromRuntime = (summary: unknown): string[] => {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return [];
  }

  const missing = (summary as { missing?: unknown }).missing;
  return Array.isArray(missing)
    ? missing.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
};

const buildSettingsProviderRuntimeEvidence = ({
  database,
  storage,
  supabase,
  vercel,
  mediaScanner,
  notifications,
  commerce,
  interactiveComponents,
  publicApi,
}: {
  database: unknown;
  storage: unknown;
  supabase: unknown;
  vercel: unknown;
  mediaScanner: unknown;
  notifications: unknown;
  commerce: unknown;
  interactiveComponents: unknown;
  publicApi: unknown;
}) => {
  const missingInputAliases = uniqueTextValues([
    ...missingInputsFromRuntime(database),
    ...missingInputsFromRuntime(storage),
    ...missingInputsFromRuntime(supabase),
    ...missingInputsFromRuntime(vercel),
    ...missingInputsFromRuntime(mediaScanner),
    ...missingInputsFromRuntime(notifications),
    ...missingInputsFromRuntime(commerce),
    ...missingInputsFromRuntime(interactiveComponents),
    ...missingInputsFromRuntime(publicApi),
  ]);

  return {
    database,
    storage,
    supabase,
    vercel,
    mediaScanner,
    notifications,
    commerce,
    interactiveComponents,
    publicApi,
    missingInputAliases,
    localRuntimeInputsConfigured: missingInputAliases.length === 0,
    liveProviderGateRequired: true,
    secretHandling: 'Provider secret values are never returned; runtime evidence reports booleans, aliases, provider families, and non-secret URLs only.',
  };
};

type SettingsProviderCertificationEvidencePacketStatus =
  | 'no-family-selected'
  | 'needs-runtime-inputs'
  | 'needs-scenario-evidence'
  | 'evidence-complete';

type SettingsProviderCertificationArtifactReadinessKey =
  | 'storage-media'
  | 'credential-rotation'
  | 'vercel-deployment'
  | 'notification-delivery'
  | 'public-api-cors'
  | 'commerce-provider-bridge'
  | 'release-certification-readiness';

type SettingsProviderCertificationRuntimeEvidence = ReturnType<typeof buildSettingsProviderRuntimeEvidence>;

type SettingsProviderCertificationScenarioEvidence = {
  schemaVersion: string;
  status: 'ready' | 'attention';
  requiredGate: string;
  coverage: {
    covered: number;
    total: number;
    missing: string[];
  };
  scenarios: Array<{
    key: string;
    label: string;
    expectedEvidence: readonly string[];
    nextAction: string;
    evidenceCount: number;
    status: 'covered' | 'missing';
  }>;
  secretHandling: string;
};

const settingsCertificationOptionLabel = <T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
): string => options.find((option) => option.value === value)?.label || value;

const settingsProviderCertificationGroup = (family: string) => (
  SETTINGS_PROVIDER_CERTIFICATION_GROUPS.find((group) => group.family === family)
);

const settingsProviderCertificationScenarioExpectedEvidence = (scenarioKey: string): string[] => {
  const scenario = SETTINGS_PROVIDER_CERTIFICATION_SCENARIOS.find((item) => item.key === scenarioKey);
  return scenario ? [...scenario.expectedEvidence] : [];
};

const hasSettingsCommerceProviderRuntime = (
  runtimeCommerce?: SiteSettingsInput['runtimeCommerce'],
  commerce?: NonNullable<SiteSettingsInput['integrations']>['commerce'],
): boolean => Boolean(
  runtimeCommerce?.webhookSecretConfigured ||
  runtimeCommerce?.stripeSecretConfigured ||
  runtimeCommerce?.paypalAccessTokenConfigured ||
  runtimeCommerce?.paddleApiKeyConfigured ||
  runtimeCommerce?.squareAccessTokenConfigured ||
  runtimeCommerce?.adyenApiKeyConfigured ||
  runtimeCommerce?.mollieApiKeyConfigured ||
  (runtimeCommerce?.razorpayKeyIdConfigured && runtimeCommerce?.razorpayKeySecretConfigured) ||
  runtimeCommerce?.easyPostApiKeyConfigured ||
  runtimeCommerce?.shippoApiKeyConfigured ||
  runtimeCommerce?.shopifyAdminAccessTokenConfigured ||
  runtimeCommerce?.bigCommerceAccessTokenConfigured ||
  runtimeCommerce?.wooCommerceConsumerKeyConfigured ||
  runtimeCommerce?.etsyAccessTokenConfigured ||
  runtimeCommerce?.magentoAccessTokenConfigured ||
  commerce?.webhookEventsEnabled ||
  (commerce?.paymentProvider && commerce.paymentProvider !== 'none') ||
  commerce?.catalogSyncProvider
);

const buildSettingsProviderCertificationArtifactReadiness = ({
  runtimeStorage,
  runtimeVercel,
  runtimeNotifications,
  runtimePublicApi,
  runtimeCommerce,
  integrations,
  runtimeEvidence,
  scenarioEvidence,
}: {
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  runtimeNotifications?: SiteSettingsInput['runtimeNotifications'];
  runtimePublicApi?: SiteSettingsInput['runtimePublicApi'];
  runtimeCommerce?: SiteSettingsInput['runtimeCommerce'];
  integrations?: SiteSettingsInput['integrations'];
  runtimeEvidence: SettingsProviderCertificationRuntimeEvidence;
  scenarioEvidence: SettingsProviderCertificationScenarioEvidence;
}): Record<SettingsProviderCertificationArtifactReadinessKey, boolean> => {
  const storage = integrations?.storage;
  const vercel = integrations?.vercel;
  const notifications = integrations?.notifications;
  const commerce = integrations?.commerce;
  const scenarioCovered = (key: string) => scenarioEvidence.scenarios.some((scenario) => scenario.key === key && scenario.status === 'covered');
  const storageReady = Boolean(runtimeStorage?.configured || storage?.provider || storage?.bucket || storage?.publicBaseUrl);

  return {
    'storage-media': storageReady,
    'credential-rotation': storageReady,
    'vercel-deployment': Boolean(runtimeVercel?.configured || vercel?.projectId || vercel?.productionDomain),
    'notification-delivery': Boolean(runtimeNotifications?.productionReady || runtimeNotifications?.configured || notifications),
    'public-api-cors': Boolean(runtimePublicApi?.corsAllowedOriginsConfigured && runtimePublicApi.exposedContractHeaders?.length),
    'commerce-provider-bridge': hasSettingsCommerceProviderRuntime(runtimeCommerce, commerce),
    'release-certification-readiness': Boolean(runtimeEvidence.localRuntimeInputsConfigured && scenarioCovered('release-certification-readiness')),
  };
};

const buildSettingsProviderCertificationEvidencePacket = ({
  options,
  command,
  envTemplate,
  requiredAliases,
  runtimeEvidence,
  scenarioEvidence,
  artifactReadiness,
}: {
  options: SettingsCertificationCommandOptions;
  command: string;
  envTemplate: string;
  requiredAliases: string[];
  runtimeEvidence: SettingsProviderCertificationRuntimeEvidence;
  scenarioEvidence: SettingsProviderCertificationScenarioEvidence;
  artifactReadiness: Record<SettingsProviderCertificationArtifactReadinessKey, boolean>;
}) => {
  const storageGroup = settingsProviderCertificationGroup('Storage and media delivery');
  const vercelGroup = settingsProviderCertificationGroup('Vercel deployment and secrets');
  const notificationsGroup = settingsProviderCertificationGroup('Notifications');
  const publicApiGroup = settingsProviderCertificationGroup('Public API and custom frontend CORS');
  const commerceGroup = settingsProviderCertificationGroup('Commerce providers');

  const familyArtifacts = [
    {
      key: 'storage-media',
      family: 'Storage and media delivery',
      selected: options.certifyStorage,
      ready: artifactReadiness['storage-media'],
      providerAlias: settingsCertificationOptionLabel(SETTINGS_CERTIFICATION_STORAGE_PROVIDER_OPTIONS, options.storageProvider),
      requiredInputs: storageGroup ? [...storageGroup.requiredInputs] : ['BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER'],
      expectedArtifacts: settingsProviderCertificationScenarioExpectedEvidence('storage-media'),
      captureSource: 'storage provisioning probe, media scanner diagnostics, runtime storage summary, and Settings storage metadata',
    },
    {
      key: 'credential-rotation',
      family: 'Storage credential rotation',
      selected: options.certifyRotation,
      ready: artifactReadiness['credential-rotation'],
      providerAlias: settingsCertificationOptionLabel(SETTINGS_CERTIFICATION_STORAGE_PROVIDER_OPTIONS, options.storageProvider),
      requiredInputs: [
        ...(storageGroup ? [...storageGroup.requiredInputs] : ['BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER']),
        'BACKY_*_NEXT_* replacement storage env',
      ],
      expectedArtifacts: ['current credential alias readiness', 'replacement credential alias readiness', 'rotation probe result'],
      captureSource: 'storage credential rotation probe and secret-manager planning response',
    },
    {
      key: 'vercel-deployment',
      family: 'Vercel deployment and secrets',
      selected: options.certifyVercelSecrets,
      ready: artifactReadiness['vercel-deployment'],
      providerAlias: options.vercelProjectId.trim() || options.vercelTeamId.trim() || 'Vercel project/team selector',
      requiredInputs: vercelGroup ? [...vercelGroup.requiredInputs] : ['VERCEL_TOKEN or BACKY_VERCEL_TOKEN'],
      expectedArtifacts: settingsProviderCertificationScenarioExpectedEvidence('vercel-deployment'),
      captureSource: 'Vercel runtime diagnostics, env secret-manager dry-run, and project/team selector metadata',
    },
    {
      key: 'notification-delivery',
      family: 'Notification delivery',
      selected: options.certifyNotification,
      ready: artifactReadiness['notification-delivery'],
      providerAlias: settingsCertificationOptionLabel(SETTINGS_CERTIFICATION_NOTIFICATION_PROVIDER_OPTIONS, options.notificationProvider),
      requiredInputs: notificationsGroup ? [...notificationsGroup.requiredInputs] : ['BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL'],
      expectedArtifacts: settingsProviderCertificationScenarioExpectedEvidence('notification-delivery'),
      captureSource: 'test notification delivery endpoint, local outbox, Resend, SMTP, or webhook delivery diagnostics',
    },
    {
      key: 'public-api-cors',
      family: 'Public API and custom frontend CORS',
      selected: options.certifyPublicApiCors,
      ready: artifactReadiness['public-api-cors'],
      providerAlias: options.publicApiOrigin.trim() || 'BACKY_CORS_ALLOWED_ORIGINS',
      requiredInputs: publicApiGroup ? [...publicApiGroup.requiredInputs] : ['BACKY_CORS_ALLOWED_ORIGINS'],
      expectedArtifacts: settingsProviderCertificationScenarioExpectedEvidence('public-api-cors'),
      captureSource: 'Public API/CORS runtime summary, OPTIONS preflight, GET /api/sites origin echo, and exposed Backy contract headers',
    },
    {
      key: 'commerce-provider-bridge',
      family: 'Commerce provider bridge',
      selected: options.certifyCommerce,
      ready: artifactReadiness['commerce-provider-bridge'],
      providerAlias: 'Nested Commerce provider certification',
      requiredInputs: commerceGroup ? [...commerceGroup.requiredInputs] : ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET'],
      expectedArtifacts: settingsProviderCertificationScenarioExpectedEvidence('commerce-provider-bridge'),
      captureSource: 'nested commerce provider certification summary and Settings commerce runtime diagnostics',
    },
    {
      key: 'release-certification-readiness',
      family: 'Release certification readiness',
      selected: options.includeReleaseDoctor,
      ready: artifactReadiness['release-certification-readiness'],
      providerAlias: 'Release doctor',
      requiredInputs: [
        'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1',
        'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
        'npm run doctor:release-certification',
      ],
      expectedArtifacts: settingsProviderCertificationScenarioExpectedEvidence('release-certification-readiness'),
      captureSource: 'release certification doctor output, missing-alias summary, and selected provider-family flags',
    },
  ];
  const selectedArtifacts = familyArtifacts.filter((artifact) => artifact.selected);
  const missingSelectedFamilies = selectedArtifacts
    .filter((artifact) => !artifact.ready)
    .map((artifact) => artifact.key);
  const status: SettingsProviderCertificationEvidencePacketStatus = selectedArtifacts.length === 0
    ? 'no-family-selected'
    : missingSelectedFamilies.length > 0
      ? 'needs-runtime-inputs'
      : scenarioEvidence.status === 'ready'
        ? 'evidence-complete'
        : 'needs-scenario-evidence';

  return {
    schemaVersion: 'backy.settings-provider-certification-evidence-packet.v1',
    generatedAt: new Date().toISOString(),
    status,
    selectedFamilies: selectedArtifacts.map((artifact) => artifact.key),
    selectedProviderAliases: Object.fromEntries(selectedArtifacts.map((artifact) => [
      artifact.key,
      artifact.providerAlias,
    ])),
    target: {
      siteId: options.siteId.trim() || 'site-demo',
      settingsAdminApi: '/api/admin/settings?certificationSiteId={siteId}',
      siteScopedSettingsApi: '/api/admin/sites/{siteId}/settings',
      settingsApi: '/api/admin/sites/{siteId}/settings',
      settingsSiteSelectorEnv: 'BACKY_SETTINGS_CERTIFY_SITE_ID',
      commerceSiteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      externalBaseUrl: options.externalBaseUrl.trim() || null,
      publicApiOrigin: options.publicApiOrigin.trim() || null,
    },
    runtimeReadiness: {
      localRuntimeInputsConfigured: runtimeEvidence.localRuntimeInputsConfigured,
      missingInputAliases: runtimeEvidence.missingInputAliases,
      missingSelectedFamilies,
    },
    operatorArtifacts: selectedArtifacts.map((artifact) => ({
      key: artifact.key,
      family: artifact.family,
      providerAlias: artifact.providerAlias,
      status: artifact.ready ? 'ready-to-run' as const : 'needs-runtime-inputs' as const,
      requiredInputs: artifact.requiredInputs,
      expectedArtifacts: artifact.expectedArtifacts,
      captureSource: artifact.captureSource,
      redaction: 'Attach ids, timestamps, provider-family names, status codes, counts, and command summaries only; remove database URLs, provider credentials, service-role keys, Vercel tokens, notification secrets, commerce secrets, and customer/order payloads.',
    })),
    scenarioAttachments: scenarioEvidence.scenarios.map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      status: scenario.status,
      evidenceCount: scenario.evidenceCount,
      expectedEvidence: [...scenario.expectedEvidence],
      nextAction: scenario.nextAction,
    })),
    commandPreview: {
      command,
      envTemplate,
      requiredAliases,
      targetInputs: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.targetInputs,
    },
    redactionPolicy: {
      includesProviderSecrets: false,
      includesDatabaseUrls: false,
      includesServiceRoleKeys: false,
      includesVercelTokens: false,
      includesNotificationSecrets: false,
      includesCommerceSecrets: false,
      includesCustomerOrOrderPayloads: false,
      allowedEvidence: [
        'provider-family names and selectors',
        'timestamped preflight and doctor summaries',
        'runtime readiness booleans and missing-alias names',
        'storage, notification, Vercel, and commerce status codes',
        'custom frontend origins and exposed Backy contract header names',
        'scenario counts and coverage state',
      ],
    },
    secretHandling: 'Redacted operator attachment manifest only; database URLs, provider credentials, service-role keys, Vercel tokens, notification secrets, commerce secrets, and customer/order payloads stay out of copied JSON.',
  };
};

type FrontendDatabaseCertificationEnvAlias = 'BACKY_DATABASE_URL' | 'DATABASE_URL';

type FrontendDatabaseCertificationCommandOptions = {
  databaseEnvAlias: FrontendDatabaseCertificationEnvAlias;
  disposableConfirmed: boolean;
  expectedHost: string;
  expectedDatabase: string;
  includeReleaseDoctor: boolean;
};

const FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES: FrontendDatabaseCertificationEnvAlias[] = ['BACKY_DATABASE_URL', 'DATABASE_URL'];

const DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS = {
  databaseEnvAlias: 'BACKY_DATABASE_URL',
  disposableConfirmed: true,
  expectedHost: '',
  expectedDatabase: '',
  includeReleaseDoctor: true,
} satisfies FrontendDatabaseCertificationCommandOptions;

const buildFrontendDatabaseCertificationEnvEntries = (
  options: FrontendDatabaseCertificationCommandOptions,
): Array<[string, string]> => {
  const envEntries: Array<[string, string]> = [
    ['BACKY_DATA_MODE', 'database'],
    ['BACKY_SDK_REQUIRE_DATABASE', '1'],
    ['BACKY_DATABASE_DISPOSABLE_CONFIRMED', options.disposableConfirmed ? 'true' : '<confirm-disposable-db-first>'],
  ];

  if (options.includeReleaseDoctor) {
    envEntries.unshift(
      ['BACKY_RELEASE_CERTIFY_DATABASE', '1'],
      ['BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED', '1'],
    );
  }

  const expectedHost = options.expectedHost.trim();
  const expectedDatabase = options.expectedDatabase.trim();
  if (expectedHost) {
    envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST', expectedHost]);
  }
  if (expectedDatabase) {
    envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE', expectedDatabase]);
  }

  return envEntries;
};

const buildFrontendDatabaseCertificationCommand = (options: FrontendDatabaseCertificationCommandOptions): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    `# Store the disposable database URL in ${options.databaseEnvAlias} as a CI secret or local shell env.`,
    `# export ${options.databaseEnvAlias}='<postgres-url>'`,
    ...envEntries.map(([key, value]) => `export ${key}=${quoteShellValue(value)}`),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    'npm run ci:sdk-postgres-smoke',
  ].join('\n');
};

const buildFrontendDatabaseCertificationEnvTemplate = (options: FrontendDatabaseCertificationCommandOptions): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    '# Backy frontend SDK database certification environment',
    '# Keep the disposable database URL in CI secrets or local shell variables.',
    `${options.databaseEnvAlias}=<disposable-postgres-url>`,
    ...envEntries.map(([key, value]) => `${key}=${quoteEnvTemplateValue(value)}`),
  ].join('\n');
};

const buildFrontendDatabaseCertificationRequiredInputs = (options: FrontendDatabaseCertificationCommandOptions): string[] => [
  `${options.databaseEnvAlias}=<disposable-postgres-url>`,
  'BACKY_DATA_MODE=database',
  'BACKY_SDK_REQUIRE_DATABASE=1',
  'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
  'disposable migrated Supabase/Postgres database',
  'public manifest/OpenAPI/render/media/forms/interactive-component migrations with RLS policies',
  ...(options.expectedHost.trim() ? ['BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'] : []),
  ...(options.expectedDatabase.trim() ? ['BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'] : []),
  ...(options.includeReleaseDoctor ? ['BACKY_RELEASE_CERTIFY_DATABASE=1', 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1'] : []),
];

const FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildFrontendDatabaseCertificationCommand(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  envTemplate: buildFrontendDatabaseCertificationEnvTemplate(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: 'backy.frontend-database-certification-env-template.v1',
  databaseUrlAliases: FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES,
  requiredInputs: buildFrontendDatabaseCertificationRequiredInputs(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  targetGuards: [
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  ],
  secretHandling: 'Disposable database URLs stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.',
};
const FRONTEND_DATABASE_CERTIFICATION_COVERAGE_FAMILIES = [
  'manifest',
  'openapi',
  'render',
  'media',
  'collections',
  'reusable-sections',
  'forms',
  'comments',
  'events',
  'commerce',
  'interactive-components',
  'generated-sdk',
] as const;
const FRONTEND_DATABASE_CERTIFICATION_SCENARIOS = [
  {
    key: 'manifest-openapi-discovery',
    label: 'Manifest and OpenAPI discovery',
    expectedEvidence: ['public manifest response', 'site-scoped OpenAPI response', 'Backy contract headers'],
    nextAction: 'Run the SDK Postgres smoke and attach manifest/OpenAPI response evidence from the disposable database target.',
  },
  {
    key: 'render-route-resolution',
    label: 'Render and route resolution',
    expectedEvidence: ['route resolve response', 'render payload', 'redirect/gone route case'],
    nextAction: 'Verify resolve, redirect/gone, and render payload reads against database-backed pages and posts.',
  },
  {
    key: 'media-font-delivery',
    label: 'Media and font delivery',
    expectedEvidence: ['media list response', 'font manifest response', 'cache/ETag evidence'],
    nextAction: 'Run media/font SDK reads against migrated database media records and public cache headers.',
  },
  {
    key: 'cms-reusable-content',
    label: 'CMS and reusable content',
    expectedEvidence: ['collection schema', 'collection records', 'reusable sections'],
    nextAction: 'Verify collection schemas/records and reusable sections from the disposable database service data.',
  },
  {
    key: 'forms-comments-events',
    label: 'Forms, comments, and events',
    expectedEvidence: ['form definition', 'comment moderation contract', 'interaction event feed'],
    nextAction: 'Exercise public forms, comments, moderation/reporting, and event reads in the SDK Postgres smoke.',
  },
  {
    key: 'commerce-contracts',
    label: 'Commerce contracts',
    expectedEvidence: ['commerce catalog', 'order contract', 'provider certification handoff'],
    nextAction: 'Verify catalog/order contract discovery against database-backed products and private order queues.',
  },
  {
    key: 'interactive-runtime',
    label: 'Interactive runtime',
    expectedEvidence: ['component registry', 'sandbox metadata', 'runtime telemetry endpoint'],
    nextAction: 'Verify interactive registry, sandbox response headers, and telemetry contract reads in database mode.',
  },
  {
    key: 'generated-sdk-cache',
    label: 'Generated SDK and cache',
    expectedEvidence: ['generated TypeScript contract', 'SDK smoke', '304 cache revalidation'],
    nextAction: 'Run generated type checks and SDK cached manifest/OpenAPI/render helpers against the disposable target.',
  },
  {
    key: 'database-runtime-guard',
    label: 'Database runtime guard',
    expectedEvidence: ['database URL alias configured', 'disposable confirmation', 'target host/database guard'],
    nextAction: 'Set the database URL alias, disposable confirmation, and optional expected host/name guards before the DB smoke.',
  },
] as const;

const buildFrontendDatabaseCertificationScenarioEvidence = ({
  databaseReady,
  publicApiReady,
}: {
  databaseReady: boolean;
  publicApiReady: boolean;
}) => {
  const countEvidence = (...values: boolean[]) => values.filter(Boolean).length;
  const coverageSet = new Set<string>(FRONTEND_DATABASE_CERTIFICATION_COVERAGE_FAMILIES);
  const evidenceCounts: Record<string, number> = {
    'manifest-openapi-discovery': countEvidence(
      coverageSet.has('manifest'),
      coverageSet.has('openapi'),
      publicApiReady,
    ),
    'render-route-resolution': countEvidence(coverageSet.has('render')),
    'media-font-delivery': countEvidence(coverageSet.has('media')),
    'cms-reusable-content': countEvidence(
      coverageSet.has('collections'),
      coverageSet.has('reusable-sections'),
    ),
    'forms-comments-events': countEvidence(
      coverageSet.has('forms'),
      coverageSet.has('comments'),
      coverageSet.has('events'),
    ),
    'commerce-contracts': countEvidence(coverageSet.has('commerce')),
    'interactive-runtime': countEvidence(coverageSet.has('interactive-components')),
    'generated-sdk-cache': countEvidence(coverageSet.has('generated-sdk')),
    'database-runtime-guard': countEvidence(databaseReady),
  };
  const scenarios = FRONTEND_DATABASE_CERTIFICATION_SCENARIOS.map((scenario) => {
    const evidenceCount = evidenceCounts[scenario.key] || 0;
    return {
      ...scenario,
      evidenceCount,
      status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
    };
  });
  const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

  return {
    schemaVersion: 'backy.frontend-database-certification-evidence.v1',
    status: covered === scenarios.length ? 'ready' as const : 'attention' as const,
    requiredGate: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke',
    coverage: {
      covered,
      total: scenarios.length,
      missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
    },
    scenarios,
    secretHandling: 'Frontend database certification evidence reports scenario names, counts, gates, and non-secret contract families only; database URLs, service credentials, private orders, submissions, and contact payloads stay private.',
  };
};

const hasSettingsCertificationGroup = (options: SettingsCertificationCommandOptions) => (
  options.certifyStorage ||
  options.certifyRotation ||
  options.certifyVercelSecrets ||
  options.certifyNotification ||
  options.certifyPublicApiCors
);

const buildSettingsProviderCertificationEnvEntries = (
  options: SettingsCertificationCommandOptions,
): Array<[string, string]> => {
  const settingsSelected = hasSettingsCertificationGroup(options);
  const externalBaseUrl = options.externalBaseUrl.trim().replace(/\/$/, '');
  const siteId = options.siteId.trim() || 'site-demo';
  const envEntries: Array<[string, string]> = [
    ['BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED', boolEnv(settingsSelected)],
    ['BACKY_SETTINGS_CERTIFY_SITE_ID', siteId],
    ['BACKY_SETTINGS_CERTIFY_STORAGE', boolEnv(options.certifyStorage)],
    ['BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER', options.storageProvider],
    ['BACKY_SETTINGS_CERTIFY_ROTATION', boolEnv(options.certifyRotation)],
    ['BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS', boolEnv(options.certifyVercelSecrets)],
    ['BACKY_SETTINGS_CERTIFY_NOTIFICATION', boolEnv(options.certifyNotification)],
    ['BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER', options.notificationProvider],
    ['BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS', boolEnv(options.certifyPublicApiCors)],
    ['BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED', boolEnv(options.certifyCommerce)],
  ];

  if (settingsSelected) {
    envEntries.push([SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV, SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT]);
  }

  if (options.certifyCommerce) {
    envEntries.push(
      ['BACKY_COMMERCE_CERTIFY_SITE_ID', siteId],
      [SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV, SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT],
    );
  }

  if (options.includeReleaseDoctor) {
    envEntries.unshift(['BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED', '1']);
  }

  if (externalBaseUrl) {
    envEntries.push(
      ['BACKY_SETTINGS_CERTIFICATION_BASE_URL', externalBaseUrl],
      ['BACKY_COMMERCE_CERTIFICATION_BASE_URL', externalBaseUrl],
      ['BACKY_ADMIN_API_KEY', '<admin-api-key>'],
    );
  }

  if (options.certifyVercelSecrets && options.vercelProjectId.trim()) {
    envEntries.push(['BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID', options.vercelProjectId.trim()]);
  }

  if (options.certifyVercelSecrets && options.vercelTeamId.trim()) {
    envEntries.push(['BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID', options.vercelTeamId.trim()]);
  }

  if (options.certifyPublicApiCors) {
    const publicApiOrigin = options.publicApiOrigin.trim();
    envEntries.push(
      ['BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN', publicApiOrigin || '<https://custom-frontend.example.com>'],
      ['BACKY_CORS_ALLOWED_ORIGINS', publicApiOrigin || '<https://custom-frontend.example.com>'],
    );
  }

  return envEntries;
};

const buildSettingsProviderCertificationCommand = (options: SettingsCertificationCommandOptions): string => {
  const settingsSelected = hasSettingsCertificationGroup(options);
  const envEntries = buildSettingsProviderCertificationEnvEntries(options);
  const commands = [
    ...(settingsSelected
      ? [
          'npm run ci:settings-provider-certification',
          ...(options.includeReleaseDoctor ? [SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND] : []),
        ]
      : []),
    ...(options.certifyCommerce
      ? [
          'npm run ci:commerce-provider-certification',
          ...(options.includeReleaseDoctor ? [SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND] : []),
        ]
      : []),
  ];

  return [
    ...envEntries.map(([key, value]) => `export ${key}=${quoteShellValue(value)}`),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    ...(commands.length ? commands : ['# Select at least one provider family before running certification.']),
  ].join('\n');
};

const buildSettingsProviderCertificationEnvTemplate = (options: SettingsCertificationCommandOptions): string => {
  const envEntries = buildSettingsProviderCertificationEnvEntries(options);

  return [
    '# Backy settings provider certification environment',
    '# Keep real provider credential values in CI secrets or local shell variables.',
    ...envEntries.map(([key, value]) => `${key}=${quoteEnvTemplateValue(value)}`),
  ].join('\n');
};

const buildSettingsProviderCertificationRequiredAliases = (options: SettingsCertificationCommandOptions): string[] => {
  const aliases = [
    options.includeReleaseDoctor ? 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1' : '',
    hasSettingsCertificationGroup(options) ? 'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1' : '',
    hasSettingsCertificationGroup(options) ? 'BACKY_SETTINGS_CERTIFY_SITE_ID or BACKY_SETTINGS_CERTIFICATION_SITE_ID' : '',
    hasSettingsCertificationGroup(options) ? `${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}` : '',
    hasSettingsCertificationGroup(options) ? `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_SETTINGS_CERTIFICATION_ARTIFACT` : '',
    hasSettingsCertificationGroup(options) ? `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1` : '',
    options.certifyCommerce ? 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1' : '',
    options.certifyCommerce ? 'BACKY_COMMERCE_CERTIFY_SITE_ID' : '',
    options.certifyCommerce ? `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT}` : '',
    options.certifyCommerce ? `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT` : '',
    options.certifyCommerce ? `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1` : '',
  ];
  const externalBaseUrl = options.externalBaseUrl.trim();

  if (externalBaseUrl) {
    aliases.push(
      'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
      'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
      'BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
    );
  }

  if (options.certifyStorage || options.certifyRotation) {
    aliases.push('BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER');
    if (options.storageProvider === 'auto' || options.storageProvider === 'supabase') {
      aliases.push(
        'BACKY_SUPABASE_URL or SUPABASE_URL',
        'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
        'BACKY_SUPABASE_STORAGE_BUCKET or BACKY_STORAGE_BUCKET',
      );
    }
    if (options.storageProvider === 'auto' || options.storageProvider === 's3') {
      aliases.push(
        'BACKY_S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID',
        'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY',
        'BACKY_S3_REGION or AWS_REGION',
      );
    }
  }

  if (options.certifyRotation) {
    aliases.push('BACKY_*_NEXT_* replacement storage env');
  }

  if (options.certifyVercelSecrets) {
    aliases.push(
      'VERCEL_TOKEN or BACKY_VERCEL_TOKEN',
      'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID',
      'VERCEL_TEAM_ID or BACKY_VERCEL_TEAM_ID',
    );
  }

  if (options.certifyNotification) {
    aliases.push('BACKY_EMAIL_PROVIDER or BACKY_TRANSACTIONAL_EMAIL_PROVIDER');
    if (options.notificationProvider === 'auto' || options.notificationProvider === 'http-endpoint') {
      aliases.push('BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL');
    }
    if (options.notificationProvider === 'auto' || options.notificationProvider === 'resend') {
      aliases.push('BACKY_RESEND_API_KEY or RESEND_API_KEY');
    }
    if (options.notificationProvider === 'auto' || options.notificationProvider === 'smtp') {
      aliases.push(
        'BACKY_SMTP_HOST or SMTP_HOST',
        'BACKY_SMTP_USER or SMTP_USER',
        'BACKY_SMTP_PASSWORD or SMTP_PASSWORD',
      );
    }
  }

  if (options.certifyPublicApiCors) {
    aliases.push(
      'BACKY_CORS_ALLOWED_ORIGINS',
      'BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN',
    );
  }

  if (options.certifyCommerce) {
    aliases.push(
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
      'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
      'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
      'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
      'provider-specific catalog/payment/subscription credentials',
    );
  }

  return uniqueTextValues(aliases);
};

const SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV = 'BACKY_SETTINGS_CERTIFICATION_OUTPUT';
const SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT = 'artifacts/backy-settings-provider-certification.json';
const SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV = 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH';
const SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV = 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED';
const SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND =
  `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV}="$${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV}" ${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 npm run doctor:release-certification`;
const SETTINGS_PROVIDER_CERTIFICATION_COMPLETION_COMMAND =
  `${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT} npm run ci:settings-provider-certification && ${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV}=${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT} ${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 npm run doctor:release-certification`;
const SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV = 'BACKY_COMMERCE_CERTIFICATION_OUTPUT';
const SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT = 'artifacts/backy-commerce-provider-certification.json';
const SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_PATH_ENV = 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH';
const SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED_ENV = 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED';
const SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND =
  `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_PATH_ENV}="$${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV}" ${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 npm run doctor:release-certification`;
const SETTINGS_COMMERCE_CERTIFICATION_COMPLETION_COMMAND =
  `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT} npm run ci:commerce-provider-certification && ${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_PATH_ENV}=${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT} ${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 npm run doctor:release-certification`;

const SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildSettingsProviderCertificationCommand(DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS),
  envTemplate: buildSettingsProviderCertificationEnvTemplate(DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: 'backy.settings-provider-certification-env-template.v1',
  storageProviderChoices: SETTINGS_CERTIFICATION_STORAGE_PROVIDER_OPTIONS.map((option) => option.value),
  notificationProviderChoices: SETTINGS_CERTIFICATION_NOTIFICATION_PROVIDER_OPTIONS.map((option) => option.value),
  requiredInputAliases: buildSettingsProviderCertificationRequiredAliases(DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS),
  targetInputs: [
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'BACKY_SETTINGS_CERTIFY_SITE_ID',
    'BACKY_SETTINGS_CERTIFICATION_SITE_ID',
    `${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}`,
    `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_SETTINGS_CERTIFICATION_ARTIFACT`,
    `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
    'BACKY_COMMERCE_CERTIFY_SITE_ID',
    `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT}`,
    `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT`,
    `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
    'BACKY_CORS_ALLOWED_ORIGINS',
    'BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN',
    'BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
  ],
};

const SETTINGS_LAUNCH_STATUS_STYLES: Record<SettingsLaunchReadinessStatus, string> = {
  ready: 'bg-emerald-50 text-emerald-700',
  attention: 'bg-amber-50 text-amber-700',
  blocked: 'bg-red-50 text-red-700',
};

const SETTINGS_LAUNCH_STATUS_LABELS: Record<SettingsLaunchReadinessStatus, string> = {
  ready: 'Ready',
  attention: 'Attention',
  blocked: 'Blocked',
};

const summarizeSettingsLaunchStatus = (checks: SettingsLaunchReadinessCheck[]): SettingsLaunchReadinessStatus => {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'attention')) return 'attention';
  return 'ready';
};

const buildSettingsLaunchActionPlan = (checks: SettingsLaunchReadinessCheck[]): SettingsLaunchActionPlan => {
  const blockingChecks = checks.filter((check) => check.status === 'blocked');
  const attentionChecks = checks.filter((check) => check.status === 'attention');
  const actionableChecks = [...blockingChecks, ...attentionChecks];
  const recommendedCommands = uniqueTextValues(actionableChecks.map((check) => check.gate || ''));

  return {
    schemaVersion: 'backy.settings-launch-action-plan.v1',
    nextAction: actionableChecks[0]?.nextAction || 'Settings launch controls are ready; run the release certification workflow before marking live providers complete.',
    blockingChecks: blockingChecks.map((check) => check.key),
    attentionChecks: attentionChecks.map((check) => check.key),
    recommendedCommands,
    ownerSurfaces: uniqueTextValues(actionableChecks.map((check) => check.ownerSurface)) as Array<SettingsTab | 'release'>,
  };
};

const BACKY_COMPLETION_GATE_STYLES: Record<BackyCompletionGateStatus, string> = {
  'ready-to-run': 'bg-emerald-50 text-emerald-700',
  'blocked-missing-inputs': 'bg-amber-50 text-amber-700',
};

const BACKY_COMPLETION_GATE_LABELS: Record<BackyCompletionGateStatus, string> = {
  'ready-to-run': 'Ready to run',
  'blocked-missing-inputs': 'Needs inputs',
};

const FRONTEND_API_CAPABILITIES: FrontendApiCapability[] = [
  {
    area: 'Site routing and render payloads',
    status: 'ready',
    contract: 'manifest, openapi, resolve, render, navigation, SEO, pages, blog',
    controls: 'Sites, Pages, Blog, reusable sections, redirects, SEO',
    stillNeeded: 'More visual QA and template presets for every common website pattern.',
  },
  {
    area: 'Visual design and reusable blocks',
    status: 'partial',
    contract: 'page/post render payloads, reusable sections, media, fonts, theme tokens',
    controls: 'Page editor, blog editor, media library, appearance settings',
    stillNeeded: 'Global header/footer editing, richer responsive constraints, symbols, and component variants.',
  },
  {
    area: 'Dynamic CMS objects',
    status: 'ready',
    contract: 'collections, collection records, dynamic list/detail routes',
    controls: 'Collections, records, import/export, permissions',
    stillNeeded: 'Relationship fields, computed fields, validation presets, and richer list designer controls.',
  },
  {
    area: 'Commerce and selling',
    status: 'partial',
    contract: 'commerce catalog, order-intake contract, checkout-session handoff, provider webhook settlement, private orders collection, product records',
    controls: 'Products, Orders, collections, media galleries',
    stillNeeded: 'Provider API execution, provider-grade taxes/shipping rates, automated refunds, subscriptions, fulfillment automation, and production secret configuration for the scheduled reconciliation cron.',
  },
  {
    area: 'Forms, contacts, comments, registration',
    status: 'partial',
    contract: 'form definition, submissions, contacts, comments, moderation/reporting',
    controls: 'Forms, Contacts, Comments, Users, notification settings',
    stillNeeded: 'Full member registration/login flows, form templates, automations, spam controls, and approval workflows.',
  },
  {
    area: 'Infrastructure and custom frontend handoff',
    status: 'partial',
    contract: 'settings handoff, env contract, public/admin API bases, runtime summaries',
    controls: 'Settings delivery, infrastructure, security, API keys',
    stillNeeded: 'One-click deploy orchestration, Supabase auth adapter, domain verification, and deployment history.',
  },
];

const SETTINGS_CONTROL_AREAS: Array<{
  tab: SettingsTab;
  title: string;
  detail: string;
}> = [
  {
    tab: 'delivery',
    title: 'Frontend API delivery',
    detail: 'Choose managed rendering or headless API mode and copy public/admin endpoint contracts.',
  },
  {
    tab: 'infrastructure',
    title: 'Supabase and Vercel',
    detail: 'Connect database, storage, deployment ownership, preview deploys, and hosting metadata.',
  },
  {
    tab: 'commerce',
    title: 'Commerce backend',
    detail: 'Control catalog mode, checkout provider handoff, taxes, shipping, discounts, and stock reservations.',
  },
  {
    tab: 'appearance',
    title: 'Design tokens',
    detail: 'Control global colors, typography, and frontend defaults that custom designs can consume.',
  },
  {
    tab: 'seo',
    title: 'SEO and analytics',
    detail: 'Set title templates, social previews, keywords, analytics, and public metadata defaults.',
  },
  {
    tab: 'notifications',
    title: 'Workflow alerts',
    detail: 'Route user registrations, publishes, forms, comments, and system events to the right channels.',
  },
  {
    tab: 'security',
    title: 'Access and audit',
    detail: 'Manage API keys, account rules, two-factor requirements, session length, and audit history.',
  },
];

function getEnvValue(key: string): string {
  const env =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env ??
    {};
  return env[key]?.trim() ?? '';
}

function isLocalAdminDevHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== '3001';
}

function getLocalBackendOrigin(): string {
  return isLocalAdminDevHost() ? getLocalDevBackendOrigin() : 'http://localhost:3000';
}

function getApiBase(kind: 'public' | 'admin'): string {
  const publicFallback =
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    getLocalBackendOrigin();
  const adminFallback =
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    publicFallback;
  const base = kind === 'admin' ? adminFallback : publicFallback;
  return `${base.replace(/\/api$/, '').replace(/\/$/, '')}/api${kind === 'admin' ? '/admin' : ''}`;
}

function buildCopyText(base: string, path: string): string {
  return `${base}${path}`;
}

function buildSettingsMediaStorageHandoff({
  integrations,
  runtimeStorage,
  runtimeSupabase,
  publicApiBase,
  adminApiBase,
}: {
  integrations: SiteSettingsInput['integrations'];
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  runtimeSupabase?: SiteSettingsInput['runtimeSupabase'];
  publicApiBase: string;
  adminApiBase: string;
}) {
  const storageMetadata = integrations?.storage || {};
  const provider = storageMetadata.provider || runtimeStorage?.provider || 'local';
  const bucket = storageMetadata.bucket || runtimeStorage?.bucket || runtimeSupabase?.storageBucket || '';
  const publicBaseUrl = storageMetadata.publicBaseUrl || runtimeStorage?.publicUrl || '';
  const pathPrefix = storageMetadata.pathPrefix || runtimeStorage?.basePath || 'sites/{siteId}';
  const configured = Boolean(runtimeStorage?.configured || storageMetadata.provider || storageMetadata.bucket || storageMetadata.publicBaseUrl);

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 'backy.media-storage-handoff.v1',
    status: configured ? 'ready' : 'needs-runtime-env',
    provider: {
      selected: provider,
      bucket,
      publicBaseUrl,
      pathPrefix,
      runtime: runtimeStorage || null,
      supabase: runtimeSupabase || null,
    },
    policies: {
      privateFilesEnabled: Boolean(storageMetadata.privateFilesEnabled),
      imageTransformsEnabled: storageMetadata.imageTransformsEnabled !== false,
      maxFileSizeMb: storageMetadata.maxFileSizeMb ?? null,
      workspaceStorageLimitGb: storageMetadata.workspaceStorageLimitGb ?? null,
      warningThresholdPercent: storageMetadata.warningThresholdPercent ?? null,
      allowedFileTypes: storageMetadata.allowedFileTypes || 'image/*,font/*,document/*,file/*',
    },
    endpointTemplates: {
      adminMediaList: `${adminApiBase}/sites/{siteId}/media`,
      adminMediaUpload: `${adminApiBase}/sites/{siteId}/media`,
      adminSignedUrl: `${adminApiBase}/sites/{siteId}/media/{mediaId}/signed-url`,
      publicMediaList: `${publicApiBase}/sites/{siteId}/media`,
      publicMediaFolders: `${publicApiBase}/sites/{siteId}/media/folders`,
      publicFontManifest: `${publicApiBase}/sites/{siteId}/media/fonts`,
      publicMediaDetail: `${publicApiBase}/sites/{siteId}/media/{mediaId}`,
      publicMediaFile: `${publicApiBase}/sites/{siteId}/media/{mediaId}/file`,
      publicMediaTransform: `${publicApiBase}/sites/{siteId}/media/{mediaId}/transform`,
    },
    contracts: {
      organization: 'backy.media.organization.v1',
      references: 'backy.media.references.v1',
      editableMetadata: 'backy.media.editable-metadata.v1',
      deliveryPolicy: 'MediaDeliveryPolicy',
      fileCategories: 'backy.media-file-categories.v1',
    },
    designStateUsage: {
      preservedFields: [
        'frontendDesignAssets',
        'frontendDesignContentDocument.assets',
        'content.assets.media[]',
        'content.assets.fonts[]',
        'element.props.mediaId',
        'element.props.imageMediaId',
        'element.props.fileMediaId',
        'element.props.fontMediaId',
        'element.props.mediaOrganization',
      ],
      editableSurfaces: ['pages', 'blog', 'reusable sections', 'products', 'collections', 'editor media picker'],
      customFrontendUses: ['image picker', 'font picker', 'file download picker', 'product media gallery', 'private signed delivery', 'responsive transforms'],
    },
    runtimeGate: {
      certificationCommand: 'npm run ci:settings-provider-certification',
      sourceOnlyGuard: 'BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin',
      missingRuntimeAliases: runtimeStorage?.missing || [],
    },
    privacy: {
      includesSecretValues: false,
      exposesSecretReferencesOnly: true,
      secretReferences: {
        supabaseServiceRole: storageMetadata.supabaseKeySecretRef || 'env:BACKY_SUPABASE_SERVICE_ROLE_KEY',
        s3AccessKeyId: storageMetadata.accessKeyIdSecretRef || 'env:BACKY_S3_ACCESS_KEY_ID',
        s3SecretAccessKey: storageMetadata.secretAccessKeySecretRef || 'env:BACKY_S3_SECRET_ACCESS_KEY',
      },
      excludes: ['raw provider credentials', 'service-role key values', 'signed URL tokens', 'private file bytes'],
    },
  };
}

function cloneSettingsDraftSnapshot(snapshot: SettingsDraftSnapshot): SettingsDraftSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as SettingsDraftSnapshot;
}

function normalizeAuthSettings(settings?: SiteSettingsInput['auth']): SiteSettingsInput['auth'] {
  if (!settings) {
    return settings;
  }

  return {
    ...settings,
    requireTwoFactor: settings.requireTwoFactor === true,
  };
}

function normalizeNotificationSettings(
  settings?: NonNullable<SiteSettingsInput['integrations']>['notifications'],
): NonNullable<SiteSettingsInput['integrations']>['notifications'] | undefined {
  if (!settings) {
    return settings;
  }

  const digestFrequency = settings.digestFrequency;

  return {
    ...settings,
    email: {
      ...(settings.email || {}),
      newUser: settings.email?.newUser === true,
      pagePublished: settings.email?.pagePublished === true,
      formSubmission: settings.email?.formSubmission === true,
      comments: settings.email?.comments === true,
      orderCreated: settings.email?.orderCreated === true,
      productLowStock: settings.email?.productLowStock === true,
      systemUpdates: settings.email?.systemUpdates === true,
    },
    inApp: {
      ...(settings.inApp || {}),
      comments: settings.inApp?.comments === true,
      activity: settings.inApp?.activity === true,
      mentions: settings.inApp?.mentions === true,
    },
    digestFrequency: ['instant', 'daily', 'weekly', 'off'].includes(String(digestFrequency))
      ? digestFrequency
      : 'instant',
  };
}

function normalizeSettingsIntegrations(
  integrations?: SiteSettingsInput['integrations'],
): NonNullable<SiteSettingsInput['integrations']> {
  if (!integrations) {
    return {};
  }

  return {
    ...integrations,
    ...(integrations.notifications
      ? { notifications: normalizeNotificationSettings(integrations.notifications) }
      : {}),
  };
}

function createSettingsDraftSnapshot(settings: Pick<SiteSettingsInput, 'deliveryMode' | 'auth' | 'integrations'>): SettingsDraftSnapshot {
  return {
    deliveryMode: settings.deliveryMode,
    auth: normalizeAuthSettings(settings.auth),
    integrations: normalizeSettingsIntegrations(settings.integrations),
  };
}

function settingsDraftFingerprint(snapshot: SettingsDraftSnapshot): string {
  return JSON.stringify(snapshot);
}

function formatSiteScopedLocaleRows(localization?: AdminSiteSettingsScope['siteSettings']['localization']): string {
  const defaultLocale = localization?.defaultLocale || 'en';
  const locales = localization?.locales?.length
    ? localization.locales
    : [{ code: defaultLocale, label: defaultLocale.toUpperCase(), direction: 'ltr' as const }];

  return locales
    .map((locale) => [
      locale.code,
      locale.label || locale.code.toUpperCase(),
      locale.direction === 'rtl' ? 'rtl' : 'ltr',
      locale.pathPrefix || '',
      locale.domain || '',
    ].join(' | '))
    .join('\n');
}

function parseSiteScopedLocaleRows(value: string, defaultLocale: string) {
  const normalizedDefaultLocale = defaultLocale.trim() || 'en';
  const locales = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code = '', label = '', direction = '', pathPrefix = '', domain = ''] = line
        .split('|')
        .map((part) => part.trim());
      if (!code) return null;

      return {
        code,
        label: label || code.toUpperCase(),
        default: code.toLowerCase() === normalizedDefaultLocale.toLowerCase(),
        direction: direction.toLowerCase() === 'rtl' ? 'rtl' as const : 'ltr' as const,
        pathPrefix,
        domain,
      };
    })
    .filter((locale): locale is NonNullable<typeof locale> => Boolean(locale));

  if (locales.some((locale) => locale.default)) {
    return locales;
  }

  return [
    {
      code: normalizedDefaultLocale,
      label: normalizedDefaultLocale.toUpperCase(),
      default: true,
      direction: 'ltr' as const,
      pathPrefix: '',
      domain: '',
    },
    ...locales,
  ];
}

function createSiteScopedSettingsDraft(settings?: AdminSiteSettingsScope['siteSettings']): SiteScopedSettingsDraft {
  return {
    titleTemplate: settings?.seo?.titleTemplate || '%s | {siteName}',
    defaultDescription: settings?.seo?.defaultDescription || '',
    googleAnalyticsId: settings?.analytics?.googleAnalyticsId || '',
    plausibleDomain: settings?.analytics?.plausibleDomain || '',
    twitter: settings?.social?.twitter || '',
    github: settings?.social?.github || '',
    linkedin: settings?.social?.linkedin || '',
    defaultLocale: settings?.localization?.defaultLocale || 'en',
    localeStrategy: settings?.localization?.localeStrategy || 'none',
    locales: formatSiteScopedLocaleRows(settings?.localization),
    moderationMode: settings?.commentPolicy?.moderationMode === 'auto-approve' ? 'auto-approve' : 'manual',
    blockedTerms: (settings?.commentPolicy?.blockedTerms || []).join('\n'),
  };
}

function siteScopedSettingsPatchFromDraft(draft: SiteScopedSettingsDraft) {
  const defaultLocale = draft.defaultLocale.trim() || 'en';

  return {
    seo: {
      titleTemplate: draft.titleTemplate.trim() || '%s | {siteName}',
      defaultDescription: draft.defaultDescription.trim(),
    },
    analytics: {
      googleAnalyticsId: draft.googleAnalyticsId.trim(),
      plausibleDomain: draft.plausibleDomain.trim(),
    },
    social: {
      twitter: draft.twitter.trim(),
      github: draft.github.trim(),
      linkedin: draft.linkedin.trim(),
    },
    localization: {
      defaultLocale,
      localeStrategy: draft.localeStrategy,
      locales: parseSiteScopedLocaleRows(draft.locales, defaultLocale),
    },
    commentPolicy: {
      moderationMode: draft.moderationMode,
      blockedTerms: draft.blockedTerms
        .split('\n')
        .map((term) => term.trim())
        .filter(Boolean),
    },
  };
}

// ============================================
// COMPONENT
// ============================================

function SettingsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const currentUser = useAuthStore((state) => state.user);
  const currentSession = useAuthStore((state) => state.session);
  const rotateCurrentSession = useAuthStore((state) => state.rotateSession);
  const [activeTab, setActiveTab] = useState<SettingsTab>(search.tab || 'general');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('managed-hosting');
  const [authSettings, setAuthSettings] = useState<SiteSettingsInput['auth']>();
  const [runtimeStorage, setRuntimeStorage] = useState<SiteSettingsInput['runtimeStorage']>();
  const [integrations, setIntegrations] = useState<NonNullable<SiteSettingsInput['integrations']>>({});
  const [runtimeDatabase, setRuntimeDatabase] = useState<SiteSettingsInput['runtimeDatabase']>();
  const [runtimeSupabase, setRuntimeSupabase] = useState<SiteSettingsInput['runtimeSupabase']>();
  const [runtimeMediaScanner, setRuntimeMediaScanner] = useState<SiteSettingsInput['runtimeMediaScanner']>();
  const [runtimeVercel, setRuntimeVercel] = useState<SiteSettingsInput['runtimeVercel']>();
  const [runtimeNotifications, setRuntimeNotifications] = useState<SiteSettingsInput['runtimeNotifications']>();
  const [runtimeCommerce, setRuntimeCommerce] = useState<SiteSettingsInput['runtimeCommerce']>();
  const [runtimeInteractiveComponents, setRuntimeInteractiveComponents] = useState<SiteSettingsInput['runtimeInteractiveComponents']>();
  const [runtimePublicApi, setRuntimePublicApi] = useState<SiteSettingsInput['runtimePublicApi']>();
  const [settingsAuditLogs, setSettingsAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isRotatingSession, setIsRotatingSession] = useState(false);
  const [sessionRotationNotice, setSessionRotationNotice] = useState<string | null>(null);
  const [notificationWebhookDelivery, setNotificationWebhookDelivery] = useState<SettingsNotificationWebhookDeliveryResult | null>(null);
  const [isNotificationWebhookTesting, setIsNotificationWebhookTesting] = useState(false);
  const [notificationWebhookSubmitted, setNotificationWebhookSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<SettingsDraftSnapshot | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentUser?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [siteSettingsSites, setSiteSettingsSites] = useState<Site[]>([]);
  const [selectedSiteSettingsSiteId, setSelectedSiteSettingsSiteId] = useState('');
  const [siteSettingsScope, setSiteSettingsScope] = useState<AdminSiteSettingsScope | null>(null);
  const [siteScopedSettingsDraft, setSiteScopedSettingsDraft] = useState<SiteScopedSettingsDraft>(() => createSiteScopedSettingsDraft());
  const [lastSavedSiteScopedSettingsDraft, setLastSavedSiteScopedSettingsDraft] = useState<SiteScopedSettingsDraft | null>(null);
  const [isSiteSettingsLoading, setIsSiteSettingsLoading] = useState(false);
  const [isSiteSettingsSaving, setIsSiteSettingsSaving] = useState(false);
  const [siteSettingsNotice, setSiteSettingsNotice] = useState<string | null>(null);
  const [siteSettingsAuditLogs, setSiteSettingsAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isSiteSettingsAuditLoading, setIsSiteSettingsAuditLoading] = useState(false);
  const [siteSettingsAuditNotice, setSiteSettingsAuditNotice] = useState<string | null>(null);
  const persistedDeliveryMode = useStore((state) => state.settings.deliveryMode);
  const updateSettings = useStore((state) => state.updateSettings);
  const publicApiKey = useStore((state) => state.settings.apiKeys.publicApiKey);
  const adminApiKey = useStore((state) => state.settings.apiKeys.adminApiKey);
  const canUseSettingsRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(
    currentUser && SETTINGS_PERMISSION_ROLE_DEFAULTS['settings.view'].includes(currentUser.role),
  );
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseSettingsRoleDefaults;
  const canViewSettings = isSettingsPermissionAllowed(permissionMatrix, currentUser, 'settings.view');
  const canConfigureSettings = isSettingsPermissionAllowed(permissionMatrix, currentUser, 'settings.configure');
  const canManageApiKeys = isSettingsPermissionAllowed(permissionMatrix, currentUser, 'settings.manageKeys');
  const canConfigureMedia = isSettingsPermissionAllowed(permissionMatrix, currentUser, 'media.configure');
  const canExportActivity = isSettingsPermissionAllowed(permissionMatrix, currentUser, 'activity.export');
  const canViewSiteSettings = isSettingsPermissionAllowed(permissionMatrix, currentUser, 'sites.view');
  const canConfigureSiteSettings = isSettingsPermissionAllowed(permissionMatrix, currentUser, 'sites.configure');
  const viewPermissionTitle = canViewSettings ? undefined : adminPermissionReason(permissionMatrix, currentUser, 'settings.view', SETTINGS_PERMISSION_ROLE_DEFAULTS);
  const configurePermissionTitle = canConfigureSettings ? undefined : adminPermissionReason(permissionMatrix, currentUser, 'settings.configure', SETTINGS_PERMISSION_ROLE_DEFAULTS);
  const manageKeysPermissionTitle = canManageApiKeys ? undefined : adminPermissionReason(permissionMatrix, currentUser, 'settings.manageKeys', SETTINGS_PERMISSION_ROLE_DEFAULTS);
  const mediaConfigurePermissionTitle = canConfigureMedia ? undefined : adminPermissionReason(permissionMatrix, currentUser, 'media.configure', SETTINGS_PERMISSION_ROLE_DEFAULTS);
  const activityExportPermissionTitle = canExportActivity ? undefined : adminPermissionReason(permissionMatrix, currentUser, 'activity.export', SETTINGS_PERMISSION_ROLE_DEFAULTS);
  const siteSettingsConfigurePermissionTitle = canConfigureSiteSettings ? undefined : adminPermissionReason(permissionMatrix, currentUser, 'sites.configure', SETTINGS_PERMISSION_ROLE_DEFAULTS);
  const canConfigureInfrastructure = canConfigureSettings || canConfigureMedia;
  const isMediaOnlyInfrastructureEditor = !canConfigureSettings && canConfigureMedia;
  const infrastructurePermissionTitle = canConfigureInfrastructure
    ? undefined
    : mediaConfigurePermissionTitle || configurePermissionTitle;
  const canSaveActiveSettingsTab = activeTab === 'infrastructure' ? canConfigureInfrastructure : canConfigureSettings;
  const activeSavePermissionTitle = activeTab === 'infrastructure' ? infrastructurePermissionTitle : configurePermissionTitle;
  const settingsFormDisabled = isSaving || !canConfigureSettings;
  const infrastructureFormDisabled = isSaving || !canConfigureInfrastructure;

  const applyBackendSettings = useCallback((backendSettings: SiteSettingsInput) => {
    const snapshot = createSettingsDraftSnapshot(backendSettings);
    updateSettings(backendSettings);
    setDeliveryMode(snapshot.deliveryMode);
    setAuthSettings(snapshot.auth);
    setRuntimeStorage(backendSettings.runtimeStorage);
    setIntegrations(snapshot.integrations);
    setRuntimeDatabase(backendSettings.runtimeDatabase);
    setRuntimeSupabase(backendSettings.runtimeSupabase);
    setRuntimeMediaScanner(backendSettings.runtimeMediaScanner);
    setRuntimeVercel(backendSettings.runtimeVercel);
    setRuntimeNotifications(backendSettings.runtimeNotifications);
    setRuntimeCommerce(backendSettings.runtimeCommerce);
    setRuntimeInteractiveComponents(backendSettings.runtimeInteractiveComponents);
    setRuntimePublicApi(backendSettings.runtimePublicApi);
    setLastSavedSnapshot(cloneSettingsDraftSnapshot(snapshot));
  }, [updateSettings]);

  useEffect(() => {
    setDeliveryMode(persistedDeliveryMode);
  }, [persistedDeliveryMode]);

  useEffect(() => {
    if (search.tab && search.tab !== activeTab) {
      setActiveTab(search.tab);
    }
  }, [activeTab, search.tab]);

  useEffect(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentUser?.id) {
      setPermissionMatrix(null);
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    getUserPermissions(currentUser.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(error instanceof Error ? error.message : 'Unable to load settings permissions.');
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
  }, [currentUser?.id]);

  const loadSettingsAuditLogs = useCallback(async () => {
    if (!canExportActivity) {
      setSettingsAuditLogs([]);
      setAuditNotice(null);
      return;
    }

    setIsAuditLoading(true);
    setAuditNotice(null);

    try {
      const result = await listAdminAuditLogs({
        entity: 'settings',
        entityId: 'platform',
        limit: 30,
      });
      setSettingsAuditLogs(result.logs);
    } catch {
      setAuditNotice('Unable to load settings audit trail.');
    } finally {
      setIsAuditLoading(false);
    }
  }, [canExportActivity]);

  const loadSiteSettingsAuditLogs = useCallback(async (siteId = selectedSiteSettingsSiteId) => {
    if (!siteId || !canExportActivity) {
      setSiteSettingsAuditLogs([]);
      setSiteSettingsAuditNotice(null);
      return;
    }

    setIsSiteSettingsAuditLoading(true);
    setSiteSettingsAuditNotice(null);

    try {
      const result = await listAdminAuditLogs({
        siteId,
        entity: 'site',
        entityId: siteId,
        action: 'site.settings.updated',
        limit: 5,
      });
      setSiteSettingsAuditLogs(result.logs);
    } catch {
      setSiteSettingsAuditNotice('Unable to load site settings audit trail.');
    } finally {
      setIsSiteSettingsAuditLoading(false);
    }
  }, [canExportActivity, selectedSiteSettingsSiteId]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      if (!canViewSettings) {
        setNotice(viewPermissionTitle || 'Your account cannot view settings.');
        return;
      }

      try {
        const backendSettings = await getSettings();
        if (!cancelled) {
          applyBackendSettings(backendSettings);
          setNotice(null);
        }
      } catch {
        if (!cancelled) {
          setNotice('Using local fallback settings because the backend settings API is unavailable.');
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [applyBackendSettings, canViewSettings, viewPermissionTitle]);

  useEffect(() => {
    let cancelled = false;

    const loadSitesForSiteSettings = async () => {
      if (!canViewSettings || !canViewSiteSettings) {
        setSiteSettingsSites([]);
        setSelectedSiteSettingsSiteId('');
        setSiteSettingsScope(null);
        return;
      }

      try {
        const backendSites = await listSites();
        if (cancelled) return;
        setSiteSettingsSites(backendSites);
        setSelectedSiteSettingsSiteId((current) => current || backendSites[0]?.id || '');
      } catch {
        if (!cancelled) {
          setSiteSettingsNotice('Unable to load sites for site-scoped settings.');
        }
      }
    };

    void loadSitesForSiteSettings();

    return () => {
      cancelled = true;
    };
  }, [canViewSettings, canViewSiteSettings]);

  useEffect(() => {
    let cancelled = false;

    const loadSiteSettingsScope = async () => {
      if (!selectedSiteSettingsSiteId || !canViewSiteSettings) {
        setSiteSettingsScope(null);
        const emptyDraft = createSiteScopedSettingsDraft();
        setSiteScopedSettingsDraft(emptyDraft);
        setLastSavedSiteScopedSettingsDraft(emptyDraft);
        return;
      }

      setIsSiteSettingsLoading(true);
      setSiteSettingsNotice(null);

      try {
        const scope = await getAdminSiteSettingsScope(selectedSiteSettingsSiteId);
        if (cancelled) return;
        const draft = createSiteScopedSettingsDraft(scope.siteSettings);
        setSiteSettingsScope(scope);
        setSiteScopedSettingsDraft(draft);
        setLastSavedSiteScopedSettingsDraft(draft);
      } catch {
        if (!cancelled) {
          setSiteSettingsScope(null);
          setSiteSettingsNotice('Unable to load site-scoped settings for the selected site.');
        }
      } finally {
        if (!cancelled) {
          setIsSiteSettingsLoading(false);
        }
      }
    };

    void loadSiteSettingsScope();

    return () => {
      cancelled = true;
    };
  }, [canViewSiteSettings, selectedSiteSettingsSiteId]);

  useEffect(() => {
    void loadSettingsAuditLogs();
  }, [loadSettingsAuditLogs]);

  useEffect(() => {
    if (!isPermissionMatrixPending) {
      void loadSiteSettingsAuditLogs();
    }
  }, [isPermissionMatrixPending, loadSiteSettingsAuditLogs]);

  const handleSave = async () => {
    if (isSaving) return;
    const canSaveInfrastructureWithMediaPermission = activeTab === 'infrastructure' && canConfigureMedia;
    if (!canConfigureSettings && !canSaveInfrastructureWithMediaPermission) {
      setNotice(activeSavePermissionTitle || 'Your account cannot configure settings.');
      return;
    }

    if (activeBlockingValidationIssues.length > 0) {
      setNotice('Fix settings validation issues before saving.');
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const backendSettings = await updateBackendSettings(canConfigureSettings
        ? {
            deliveryMode,
            auth: normalizeAuthSettings(authSettings),
            integrations: normalizeSettingsIntegrations(integrations),
          }
        : {
            integrations: {
              storage: integrations.storage,
              supabase: integrations.supabase,
            },
          });
      applyBackendSettings(backendSettings);
      window.dispatchEvent(new CustomEvent('backy:settings-saved'));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadSettingsAuditLogs();
    } catch {
      setNotice('Backend save failed. Settings were not persisted.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateKeys = async (scope: 'all' | 'public' | 'admin' = 'all') => {
    setNotice(null);
    if (!canManageApiKeys) {
      setNotice(manageKeysPermissionTitle || 'Your account cannot regenerate API keys.');
      return;
    }

    try {
      const backendSettings = await regenerateSettingsApiKeys(scope);
      applyBackendSettings(backendSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadSettingsAuditLogs();
    } catch {
      setNotice('Backend key regeneration failed. API keys were not changed.');
    }
  };

  const handleIssueAdminApiKey = async (label: string): Promise<IssuedAdminApiKey | null> => {
    setNotice(null);
    if (!canManageApiKeys) {
      setNotice(manageKeysPermissionTitle || 'Your account cannot issue admin API keys.');
      return null;
    }

    try {
      const result = await issueSettingsAdminApiKey(label);
      applyBackendSettings(result.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadSettingsAuditLogs();
      return result.issuedKey;
    } catch {
      setNotice('Backend key issue failed. No new admin API key was created.');
      return null;
    }
  };

  const handleRevokeAdminApiKey = async (keyId: string) => {
    setNotice(null);
    if (!canManageApiKeys) {
      setNotice(manageKeysPermissionTitle || 'Your account cannot revoke admin API keys.');
      return;
    }

    try {
      const backendSettings = await revokeSettingsAdminApiKey(keyId);
      applyBackendSettings(backendSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadSettingsAuditLogs();
    } catch {
      setNotice('Backend key revoke failed. The admin API key was not changed.');
    }
  };

  const handleRotateCurrentSession = async () => {
    setNotice(null);
    setSessionRotationNotice(null);

    if (!currentSession?.token) {
      setSessionRotationNotice('Sign in with a valid admin session before rotating it.');
      return;
    }

    setIsRotatingSession(true);
    try {
      await rotateCurrentSession();
      setSessionRotationNotice('Current session rotated. The previous token was revoked and the browser now uses the new session.');
      await loadSettingsAuditLogs();
    } catch (error) {
      setSessionRotationNotice(error instanceof Error ? error.message : 'Unable to rotate the current admin session.');
    } finally {
      setIsRotatingSession(false);
    }
  };

  const handleTestNotificationWebhook = async (retryOf?: string | null) => {
    setNotice(null);
    if (!canConfigureSettings) {
      setNotice(configurePermissionTitle || 'Your account cannot test notification webhooks.');
      return;
    }

    setNotificationWebhookSubmitted(true);
    const webhookUrl = notificationSettings.webhookUrl?.trim();
    if (!webhookUrl) {
      setNotice('Add a notification webhook URL before sending a test event.');
      return;
    }
    if (!isValidHttpUrl(webhookUrl)) {
      setNotice('Enter a valid http(s) notification webhook URL before sending a test event.');
      return;
    }

    setNotificationWebhookSubmitted(false);
    setIsNotificationWebhookTesting(true);

    try {
      const delivery = await testSettingsNotificationWebhook({
        webhookUrl,
        retryOf,
      });
      setNotificationWebhookDelivery(delivery);
      setNotice(delivery.status === 'succeeded'
        ? retryOf ? 'Notification webhook retry succeeded.' : 'Notification webhook test succeeded.'
        : retryOf ? 'Notification webhook retry failed.' : 'Notification webhook test failed.');
      await loadSettingsAuditLogs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Notification webhook test failed.');
    } finally {
      setIsNotificationWebhookTesting(false);
    }
  };

  const handleSaveSiteScopedSettings = async () => {
    if (!selectedSiteSettingsSiteId || isSiteSettingsSaving) return;
    if (!canConfigureSiteSettings) {
      setSiteSettingsNotice(siteSettingsConfigurePermissionTitle || 'Your account cannot configure site settings.');
      return;
    }
    if (!hasSiteScopedSettingsUnsavedChanges) {
      setSiteSettingsNotice('No site-scoped settings changes to save.');
      return;
    }

    setIsSiteSettingsSaving(true);
    setSiteSettingsNotice(null);

    try {
      const scope = await updateAdminSiteSettingsScope(
        selectedSiteSettingsSiteId,
        siteScopedSettingsPatchFromDraft(siteScopedSettingsDraft),
      );
      const draft = createSiteScopedSettingsDraft(scope.siteSettings);
      setSiteSettingsScope(scope);
      setSiteScopedSettingsDraft(draft);
      setLastSavedSiteScopedSettingsDraft(draft);
      setSiteSettingsNotice('Site-scoped settings saved.');
      await loadSiteSettingsAuditLogs(selectedSiteSettingsSiteId);
      await loadSettingsAuditLogs();
    } catch {
      setSiteSettingsNotice('Unable to save site-scoped settings.');
    } finally {
      setIsSiteSettingsSaving(false);
    }
  };

  const handleDiscardSiteScopedSettings = () => {
    if (!lastSavedSiteScopedSettingsDraft || isSiteSettingsSaving) return;
    setSiteScopedSettingsDraft(lastSavedSiteScopedSettingsDraft);
    setSiteSettingsNotice('Site-scoped settings changes discarded.');
  };

  const discardUnsavedChanges = () => {
    if (isSaving) return;

    if (!lastSavedSnapshot) {
      return;
    }

    const snapshot = cloneSettingsDraftSnapshot(lastSavedSnapshot);
    setDeliveryMode(snapshot.deliveryMode);
    setAuthSettings(snapshot.auth);
    setIntegrations(snapshot.integrations);
    setNotice('Unsaved settings changes discarded.');
  };

  const generalSettings: GeneralSettingsConfig = {
    ...DEFAULT_GENERAL_SETTINGS,
    ...(integrations.general || {}),
  };
  const appearanceSettings: AppearanceSettingsConfig = {
    ...DEFAULT_APPEARANCE_SETTINGS,
    ...(integrations.appearance || {}),
  };
  const seoSettings: SeoSettingsConfig = {
    ...DEFAULT_SEO_SETTINGS,
    ...(integrations.seo || {}),
  };
  const notificationSettings: NotificationSettingsConfig = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(integrations.notifications || {}),
    email: {
      ...DEFAULT_NOTIFICATION_SETTINGS.email,
      ...(integrations.notifications?.email || {}),
    },
    inApp: {
      ...DEFAULT_NOTIFICATION_SETTINGS.inApp,
      ...(integrations.notifications?.inApp || {}),
    },
  };
  const notificationWebhookUrlValue = notificationSettings.webhookUrl?.trim() || '';
  const notificationWebhookUrlInlineError = notificationWebhookSubmitted
    ? notificationWebhookUrlValue.length === 0
      ? 'Add a notification webhook URL before sending a test event.'
      : isValidHttpUrl(notificationWebhookUrlValue)
        ? null
        : 'Enter a valid http(s) notification webhook URL before sending a test event.'
    : null;
  const commerceSettings: CommerceSettingsConfig = {
    ...DEFAULT_COMMERCE_SETTINGS,
    ...(integrations.commerce || {}),
  };
  const currentSettingsSnapshot = useMemo<SettingsDraftSnapshot>(() => ({
    deliveryMode,
    auth: authSettings,
    integrations,
  }), [authSettings, deliveryMode, integrations]);
  const hasUnsavedChanges = lastSavedSnapshot
    ? settingsDraftFingerprint(currentSettingsSnapshot) !== settingsDraftFingerprint(lastSavedSnapshot)
    : false;
  const hasSiteScopedSettingsUnsavedChanges = lastSavedSiteScopedSettingsDraft
    ? JSON.stringify(siteScopedSettingsDraft) !== JSON.stringify(lastSavedSiteScopedSettingsDraft)
    : false;
  const validationIssues = useMemo(() => validateSettingsDraft({
    deliveryMode,
    generalSettings,
    appearanceSettings,
    seoSettings,
    commerceSettings,
    notificationSettings,
    authSettings,
    integrations,
  }), [
    appearanceSettings,
    authSettings,
    deliveryMode,
    generalSettings,
    integrations,
    commerceSettings,
    notificationSettings,
    seoSettings,
  ]);
  const blockingValidationIssues = validationIssues.filter((issue) => issue.severity === 'error');
  const activeBlockingValidationIssues = isMediaOnlyInfrastructureEditor && activeTab === 'infrastructure'
    ? blockingValidationIssues.filter((issue) => issue.tab === 'infrastructure' && !issue.label.startsWith('Vercel '))
    : blockingValidationIssues;
  const activeTabIndex = Math.max(0, TABS.findIndex((item) => item.id === activeTab));
  const activeTabMeta = TABS[activeTabIndex] || TABS[0];
  const ActiveTabIcon = activeTabMeta.icon;
  const previousSettingsTab = TABS[(activeTabIndex + TABS.length - 1) % TABS.length];
  const nextSettingsTab = TABS[(activeTabIndex + 1) % TABS.length];
  const saveButtonDisabled = isSaving || !canSaveActiveSettingsTab || !hasUnsavedChanges || activeBlockingValidationIssues.length > 0;
  const saveButtonLabel = saved ? 'Saved' : isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save changes' : 'No changes';
  const settingsWorkbarActionStatusId = 'settings-workbar-action-status';
  const settingsHeaderSecondaryActionStatusId = 'settings-header-secondary-action-status';
  const settingsBusyReason = isSaving ? 'Settings are saving.' : null;
  const settingsConfigureDisabledReason = settingsBusyReason || (!canConfigureSettings ? configurePermissionTitle || 'Your account cannot configure settings.' : null);
  const settingsDiscardDisabledReason = settingsBusyReason
    || (!canSaveActiveSettingsTab ? activeSavePermissionTitle || 'Your account cannot configure this Settings section.' : null)
    || (!hasUnsavedChanges ? 'No unsaved settings changes to discard.' : null);
  const settingsSaveDisabledReason = settingsBusyReason
    || (!canSaveActiveSettingsTab ? activeSavePermissionTitle || 'Your account cannot configure this Settings section.' : null)
    || (activeBlockingValidationIssues.length > 0 ? 'Fix highlighted validation issues before saving.' : null)
    || (!hasUnsavedChanges ? 'Make a settings change before saving.' : null);
  const settingsCopyHandoffActionStatus = settingsConfigureDisabledReason
    ? `Copy handoff unavailable: ${settingsConfigureDisabledReason}`
    : 'Copy handoff available.';
  const settingsDownloadJsonActionStatus = settingsConfigureDisabledReason
    ? `Download JSON unavailable: ${settingsConfigureDisabledReason}`
    : 'Download JSON available.';
  const settingsDiscardActionStatus = settingsDiscardDisabledReason
    ? `Discard changes unavailable: ${settingsDiscardDisabledReason}`
    : 'Discard changes available.';
  const settingsSaveActionStatus = settingsSaveDisabledReason
    ? `${saveButtonLabel} unavailable: ${settingsSaveDisabledReason}`
    : `${saveButtonLabel} available.`;
  const settingsHeaderSecondaryActionState = settingsConfigureDisabledReason ? 'blocked' : 'ready';
  const settingsHeaderSecondaryActionStatus = [
    settingsCopyHandoffActionStatus,
    settingsDownloadJsonActionStatus,
  ].join(' ');
  const getSettingsCompletionGateCopyActionStatus = (gate: BackyCompletionGate) => (
    settingsConfigureDisabledReason
      ? `Copy ${gate.label} command unavailable: ${settingsConfigureDisabledReason}`
      : `Copy ${gate.label} command available.`
  );
  const settingsPreviousTabActionStatus = `Previous section available: ${previousSettingsTab.name}.`;
  const settingsNextTabActionStatus = `Next section available: ${nextSettingsTab.name}.`;
  const settingsWorkbarActionStatus = [
    settingsPreviousTabActionStatus,
    settingsNextTabActionStatus,
    settingsCopyHandoffActionStatus,
    settingsDownloadJsonActionStatus,
    hasUnsavedChanges ? settingsDiscardActionStatus : null,
    settingsSaveActionStatus,
  ].filter(Boolean).join(' ');
  const activeSettingsStatusLabel = activeBlockingValidationIssues.length > 0
    ? `${activeBlockingValidationIssues.length} blocked`
    : hasUnsavedChanges
      ? 'Unsaved changes'
      : 'Saved';
  const activeSettingsStatusTone = activeBlockingValidationIssues.length > 0
    ? 'bg-destructive/10 text-destructive'
    : hasUnsavedChanges
      ? 'bg-warning/10 text-warning'
      : 'bg-success/10 text-success';
  const activeSettingsHelperText = activeBlockingValidationIssues.length > 0
    ? 'Fix highlighted validation issues before saving.'
    : hasUnsavedChanges
      ? 'Save or discard changes from here without returning to the page header.'
      : 'Jump between Settings sections without losing the active control context.';
  const platformReadiness = useMemo(() => {
    const savedGeneral = integrations.general;
    const savedAppearance = integrations.appearance;
    const savedSeo = integrations.seo;
    const savedNotifications = integrations.notifications;
    const storage = integrations.storage;
    const supabase = integrations.supabase;
    const vercel = integrations.vercel;
    const commerce = integrations.commerce;
    const storageConfigured = runtimeStorage?.configured === true
      || Boolean(storage?.provider || storage?.bucket || storage?.publicBaseUrl);
    const databaseConfigured = runtimeDatabase?.configured === true;
    const supabaseConfigured = runtimeSupabase?.configured === true
      || Boolean(supabase?.databaseEnabled || supabase?.storageEnabled || supabase?.authEnabled);
    const mediaScannerConfigured = runtimeMediaScanner?.configured !== false;
    const vercelConfigured = runtimeVercel?.configured === true
      || Boolean(vercel?.projectId || vercel?.productionDomain);
    const notificationRuntimeConfigured = runtimeNotifications?.configured !== false;
    const commerceRuntimeConfigured = !commerce?.webhookEventsEnabled
      || commerce.paymentProvider === 'none'
      || Boolean(runtimeCommerce?.webhookSecretConfigured);
    const securityConfigured = Boolean(publicApiKey && adminApiKey && (authSettings?.minPasswordLength || 0) >= 10);
    const checks = [
      {
        label: 'Delivery mode',
        detail: deliveryMode === 'custom-frontend'
          ? 'Headless API mode is selected for custom frontends.'
          : 'Managed rendering is selected for Backy-served pages.',
        ready: Boolean(deliveryMode),
      },
      {
        label: 'API keys',
        detail: publicApiKey && adminApiKey ? 'Public and admin keys exist.' : 'Generate public and admin API keys.',
        ready: Boolean(publicApiKey && adminApiKey),
      },
      {
        label: 'Storage runtime',
        detail: runtimeStorage
          ? storageConfigured
            ? `${runtimeStorage.provider} storage is configured.`
            : `Missing ${runtimeStorage.missing?.join(', ') || 'storage configuration'}.`
          : 'Storage runtime has not reported yet.',
        ready: storageConfigured,
      },
      {
        label: 'Database runtime',
        detail: runtimeDatabase
          ? databaseConfigured
            ? `${runtimeDatabase.provider || runtimeDatabase.mode || 'database'} is configured.`
            : runtimeDatabase.error || 'Database runtime needs configuration.'
          : 'Database runtime has not reported yet.',
        ready: databaseConfigured,
      },
      {
        label: 'Supabase connection',
        detail: supabaseConfigured
          ? 'Supabase metadata or runtime capability is present.'
          : 'Add Supabase project metadata or environment variables.',
        ready: supabaseConfigured,
      },
      {
        label: 'Vercel deployment',
        detail: vercelConfigured
          ? 'Vercel runtime or project metadata is present.'
          : 'Add Vercel project metadata or deploy environment variables.',
        ready: vercelConfigured,
      },
      {
        label: 'Media safety env',
        detail: mediaScannerConfigured
          ? 'Media scanner configuration is valid for the selected scanner mode.'
          : `Missing ${runtimeMediaScanner?.missing?.join(', ') || 'media scanner configuration'}.`,
        ready: mediaScannerConfigured,
      },
      {
        label: 'Design and SEO defaults',
        detail: savedGeneral || savedAppearance || savedSeo
          ? 'Global site metadata, design, or SEO defaults have been customized.'
          : 'Customize defaults before using them as frontend tokens.',
        ready: Boolean(savedGeneral || savedAppearance || savedSeo),
      },
      {
        label: 'Security baseline',
        detail: securityConfigured
          ? 'Keys and password policy are present.'
          : 'Review API keys and password/session policy.',
        ready: securityConfigured,
      },
      {
        label: 'Notification routing',
        detail: savedNotifications && notificationRuntimeConfigured
          ? 'Notification preferences and email delivery runtime are available.'
          : 'Review notification preferences and email delivery environment.',
        ready: Boolean(savedNotifications) && notificationRuntimeConfigured,
      },
      {
        label: 'Commerce controls',
        detail: commerce && commerceRuntimeConfigured
          ? `${commerce.currency || 'USD'} ${commerce.mode || 'catalog-only'} commerce settings are stored.`
          : 'Review catalog, checkout, tax, shipping, discount, reservation, and webhook secret controls.',
        ready: Boolean(commerce) && commerceRuntimeConfigured,
      },
      {
        label: 'Interactive component contract',
        detail: runtimeInteractiveComponents?.configured
          ? 'Manifest, registry, sandbox, fallback, and data-binding contract metadata is ready for custom frontends.'
          : 'Review component registry and sandbox environment before enabling custom code components.',
        ready: runtimeInteractiveComponents?.configured !== false,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Choose delivery', detail: 'Decide managed rendering or custom frontend API mode.' },
        { label: 'Connect runtime', detail: 'Wire storage, database, Supabase, and Vercel environment metadata.' },
        { label: 'Lock access', detail: 'Regenerate keys, set auth policy, and confirm audit visibility.' },
        { label: 'Publish contracts', detail: 'Use public/admin endpoints plus design and SEO defaults in any frontend.' },
      ],
    };
  }, [
    adminApiKey,
    authSettings?.minPasswordLength,
    deliveryMode,
    integrations.appearance,
    integrations.commerce,
    integrations.general,
    integrations.notifications,
    integrations.seo,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    publicApiKey,
    runtimeDatabase,
    runtimeCommerce,
    runtimeInteractiveComponents,
    runtimeMediaScanner,
    runtimeNotifications,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const publicApiBase = useMemo(() => getApiBase('public'), []);
  const adminApiBase = useMemo(() => getApiBase('admin'), []);
  const infrastructureEnvContract = useMemo(() => buildInfrastructureEnvContract({
    runtimeDatabase,
    runtimeStorage,
    runtimeSupabase,
    runtimeMediaScanner,
    runtimeVercel,
    runtimeNotifications,
    runtimeCommerce,
    runtimeInteractiveComponents,
    runtimePublicApi,
    storage: integrations.storage,
    supabase: integrations.supabase,
    vercel: integrations.vercel,
    notifications: integrations.notifications,
    commerce: integrations.commerce,
  }), [
    integrations.commerce,
    integrations.notifications,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    runtimeDatabase,
    runtimeCommerce,
    runtimeInteractiveComponents,
    runtimePublicApi,
    runtimeMediaScanner,
    runtimeNotifications,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const providerCertificationRuntimeEvidence = useMemo(() => buildSettingsProviderRuntimeEvidence({
    database: runtimeDatabase || null,
    storage: runtimeStorage || null,
    supabase: runtimeSupabase || null,
    vercel: runtimeVercel || null,
    mediaScanner: runtimeMediaScanner || null,
    notifications: runtimeNotifications || null,
    commerce: runtimeCommerce || null,
    interactiveComponents: runtimeInteractiveComponents || null,
    publicApi: runtimePublicApi || null,
  }), [
    runtimeCommerce,
    runtimeDatabase,
    runtimeInteractiveComponents,
    runtimeMediaScanner,
    runtimeNotifications,
    runtimePublicApi,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const providerCertificationScenarioEvidence = useMemo(() => {
    const countEvidence = (...values: boolean[]) => values.filter(Boolean).length;
    const commerceProviderConfigured = Boolean(
      runtimeCommerce?.webhookSecretConfigured ||
      runtimeCommerce?.stripeSecretConfigured ||
      runtimeCommerce?.paypalAccessTokenConfigured ||
      runtimeCommerce?.paddleApiKeyConfigured ||
      runtimeCommerce?.squareAccessTokenConfigured ||
      runtimeCommerce?.adyenApiKeyConfigured ||
      runtimeCommerce?.mollieApiKeyConfigured ||
      (runtimeCommerce?.razorpayKeyIdConfigured && runtimeCommerce?.razorpayKeySecretConfigured) ||
      runtimeCommerce?.easyPostApiKeyConfigured ||
      runtimeCommerce?.shippoApiKeyConfigured ||
      runtimeCommerce?.shopifyAdminAccessTokenConfigured ||
      runtimeCommerce?.bigCommerceAccessTokenConfigured ||
      runtimeCommerce?.wooCommerceConsumerKeyConfigured ||
      runtimeCommerce?.etsyAccessTokenConfigured ||
      runtimeCommerce?.magentoAccessTokenConfigured ||
      integrations.commerce?.webhookEventsEnabled ||
      (integrations.commerce?.paymentProvider && integrations.commerce.paymentProvider !== 'none') ||
      integrations.commerce?.catalogSyncProvider
    );
    const evidenceCounts: Record<string, number> = {
      'database-supabase': countEvidence(
        Boolean(runtimeDatabase?.configured),
        Boolean(runtimeSupabase?.configured || integrations.supabase?.databaseEnabled || integrations.supabase?.authEnabled || integrations.supabase?.storageEnabled),
      ),
      'storage-media': countEvidence(
        Boolean(runtimeStorage?.configured || integrations.storage?.provider || integrations.storage?.bucket || integrations.storage?.publicBaseUrl),
        runtimeMediaScanner?.configured !== false,
      ),
      'vercel-deployment': countEvidence(Boolean(runtimeVercel?.configured || integrations.vercel?.projectId || integrations.vercel?.productionDomain)),
      'notification-delivery': countEvidence(Boolean(runtimeNotifications?.productionReady || runtimeNotifications?.configured || integrations.notifications)),
      'commerce-provider-bridge': countEvidence(commerceProviderConfigured),
      'public-api-cors': countEvidence(Boolean(runtimePublicApi?.corsAllowedOriginsConfigured && runtimePublicApi.exposedContractHeaders?.length)),
      'interactive-components': countEvidence(runtimeInteractiveComponents?.configured !== false),
      'release-certification-readiness': countEvidence(providerCertificationRuntimeEvidence.localRuntimeInputsConfigured, SETTINGS_PROVIDER_CERTIFICATION_GROUPS.length > 0),
    };
    const scenarios = SETTINGS_PROVIDER_CERTIFICATION_SCENARIOS.map((scenario) => {
      const evidenceCount = evidenceCounts[scenario.key] || 0;
      return {
        ...scenario,
        evidenceCount,
        status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
      };
    });
    const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

    return {
      schemaVersion: 'backy.settings-provider-certification-evidence.v1',
      status: covered === scenarios.length ? 'ready' as const : 'attention' as const,
      requiredGate: 'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:settings-provider-certification',
      coverage: {
        covered,
        total: scenarios.length,
        missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
      },
      scenarios,
      secretHandling: 'Settings provider certification evidence reports scenario names, counts, gates, and non-secret runtime readiness only; database URLs, provider credentials, service-role keys, Vercel tokens, notification secrets, and commerce secrets stay private.',
    };
  }, [
    integrations.commerce,
    integrations.notifications,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    providerCertificationRuntimeEvidence.localRuntimeInputsConfigured,
    runtimeCommerce,
    runtimeDatabase?.configured,
    runtimeInteractiveComponents?.configured,
    runtimeMediaScanner?.configured,
    runtimeNotifications?.configured,
    runtimeNotifications?.productionReady,
    runtimePublicApi?.corsAllowedOriginsConfigured,
    runtimePublicApi?.exposedContractHeaders?.length,
    runtimeStorage?.configured,
    runtimeSupabase?.configured,
    runtimeVercel?.configured,
  ]);
  const providerCertificationArtifactReadiness = useMemo(() => buildSettingsProviderCertificationArtifactReadiness({
    runtimeStorage,
    runtimeVercel,
    runtimeNotifications,
    runtimePublicApi,
    runtimeCommerce,
    integrations,
    runtimeEvidence: providerCertificationRuntimeEvidence,
    scenarioEvidence: providerCertificationScenarioEvidence,
  }), [
    integrations,
    providerCertificationRuntimeEvidence,
    providerCertificationScenarioEvidence,
    runtimeCommerce,
    runtimeNotifications,
    runtimePublicApi,
    runtimeStorage,
    runtimeVercel,
  ]);
  const providerCertificationEvidencePacket = useMemo(() => buildSettingsProviderCertificationEvidencePacket({
    options: DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS,
    command: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.command,
    envTemplate: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.envTemplate,
    requiredAliases: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.requiredInputAliases,
    runtimeEvidence: providerCertificationRuntimeEvidence,
    scenarioEvidence: providerCertificationScenarioEvidence,
    artifactReadiness: providerCertificationArtifactReadiness,
  }), [
    providerCertificationArtifactReadiness,
    providerCertificationRuntimeEvidence,
    providerCertificationScenarioEvidence,
  ]);
  const providerCertificationHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    schemaVersion: 'backy.settings-provider-certification-handoff.v1',
    status: 'external-live-provider-gate',
    settingsGate: 'npm run ci:settings-provider-certification',
    commerceGate: 'npm run ci:commerce-provider-certification',
    localPreflight: 'npm run test:settings-provider-certification-preflight-contract',
    releasePreflight: 'npm run test:release-certification-preflight-contract',
    secretHandling: 'Provider credentials stay in deployment or CI environment variables; Settings handoff manifests only expose non-secret provider families, gate names, and readiness evidence.',
    runtimeEvidence: providerCertificationRuntimeEvidence,
    scenarioEvidence: providerCertificationScenarioEvidence,
    operatorEvidencePacket: providerCertificationEvidencePacket,
    metadataEvidence: {
      storage: integrations.storage || null,
      supabase: integrations.supabase || null,
      vercel: integrations.vercel || null,
      notifications: integrations.notifications || null,
      commerce: integrations.commerce || null,
    },
    operatorCommandTemplate: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
    operatorEnvTemplate: {
      schemaVersion: 'backy.settings-provider-certification-env-template.v1',
      format: 'shell-env',
      fileName: '.env.backy-settings-provider-certification',
      body: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.envTemplate,
      secretHandling: 'Generated template values are non-secret selectors and placeholders; replace placeholders with CI secrets or local shell values before execution.',
    },
    groups: SETTINGS_PROVIDER_CERTIFICATION_GROUPS.map((group) => ({
      family: group.family,
      providers: [...group.providers],
      gate: group.gate,
      requiredInputs: [...group.requiredInputs],
      evidence: group.evidence,
    })),
  }), [
    integrations.commerce,
    integrations.notifications,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    providerCertificationRuntimeEvidence,
    providerCertificationScenarioEvidence,
    providerCertificationEvidencePacket,
  ]);
  const frontendDatabaseCertificationScenarioEvidence = useMemo(() => buildFrontendDatabaseCertificationScenarioEvidence({
    databaseReady: Boolean(runtimeDatabase?.mode === 'database' && runtimeDatabase.configured),
    publicApiReady: Boolean(runtimePublicApi?.corsAllowedOriginsConfigured && runtimePublicApi.exposedContractHeaders.length),
  }), [
    runtimeDatabase?.configured,
    runtimeDatabase?.mode,
    runtimePublicApi?.corsAllowedOriginsConfigured,
    runtimePublicApi?.exposedContractHeaders.length,
  ]);
  const frontendDatabaseCertificationHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    schemaVersion: 'backy.frontend-database-certification.v1',
    status: 'external-database-gate',
    gate: {
      command: 'npm run ci:sdk-postgres-smoke',
      workflow: '.github/workflows/sdk-postgres-smoke.yml',
      localPreflight: 'npm run test:sdk-postgres-preflight-contract',
      typeContract: 'npm run test:frontend-contract-types',
    },
    requiredEnvironment: {
      databaseUrlAliases: ['BACKY_DATABASE_URL', 'DATABASE_URL'],
      requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
      targetGuards: ['BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST', 'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'],
    },
    operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
    operatorEnvTemplate: {
      schemaVersion: 'backy.frontend-database-certification-env-template.v1',
      format: 'shell-env',
      fileName: '.env.backy-frontend-database-certification',
      body: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.envTemplate,
      secretHandling: 'Generated template values are non-secret aliases and placeholders; replace the database URL placeholder with a disposable migrated Supabase/Postgres secret before execution.',
    },
    publicContracts: {
      manifest: '/api/sites/{siteId}/manifest#data.contract.databaseCertification',
      openApi: '/api/sites/{siteId}/openapi#x-backy-database-certification',
      sdkType: 'BackyFrontendDatabaseCertification',
    },
    coverageFamilies: [...FRONTEND_DATABASE_CERTIFICATION_COVERAGE_FAMILIES],
    scenarioEvidence: frontendDatabaseCertificationScenarioEvidence,
    runtimeEvidence: {
      database: runtimeDatabase || null,
      publicApi: runtimePublicApi || null,
    },
    secretHandling: 'Database URLs and service credentials stay in server/CI environment variables; this handoff only exports aliases, gate names, coverage, and non-secret runtime readiness.',
  }), [
    frontendDatabaseCertificationScenarioEvidence,
    runtimeDatabase,
    runtimePublicApi,
  ]);
  const settingsLaunchReadiness = useMemo(() => {
    const storageConfigured = runtimeStorage?.configured === true
      || Boolean(integrations.storage?.provider || integrations.storage?.bucket || integrations.storage?.publicBaseUrl);
    const databaseConfigured = runtimeDatabase?.configured === true;
    const databaseMode = runtimeDatabase?.mode || 'unknown';
    const supabaseConfigured = runtimeSupabase?.configured === true
      || Boolean(integrations.supabase?.databaseEnabled || integrations.supabase?.storageEnabled || integrations.supabase?.authEnabled);
    const vercelConfigured = runtimeVercel?.configured === true
      || Boolean(integrations.vercel?.projectId || integrations.vercel?.productionDomain);
    const publicApiConfigured = Boolean(runtimePublicApi?.corsAllowedOriginsConfigured && runtimePublicApi.exposedContractHeaders.length);
    const notificationConfigured = Boolean(integrations.notifications) && runtimeNotifications?.configured !== false;
    const commerceProviderNeedsCertification = integrations.commerce?.mode === 'checkout-provider'
      || integrations.commerce?.paymentProvider !== 'none'
      || integrations.commerce?.webhookEventsEnabled === true;
    const commerceRuntimeReady = !commerceProviderNeedsCertification || Boolean(runtimeCommerce?.webhookSecretConfigured);
    const interactiveReady = runtimeInteractiveComponents?.configured !== false;
    const securityReady = Boolean(publicApiKey && adminApiKey && (authSettings?.minPasswordLength || 0) >= 10);
    const providerRuntimeInputsReady = providerCertificationRuntimeEvidence.localRuntimeInputsConfigured;

    const checks: SettingsLaunchReadinessCheck[] = [
      {
        key: 'delivery-api-contracts',
        label: 'Delivery and API contracts',
        status: deliveryMode && publicApiKey ? 'ready' : 'blocked',
        detail: deliveryMode === 'custom-frontend'
          ? `Headless API mode is selected. Public base: ${publicApiBase}. Admin base: ${adminApiBase}.`
          : `Managed hosting is selected. Public base: ${publicApiBase}. Admin base: ${adminApiBase}.`,
        nextAction: 'Choose custom frontend mode or managed hosting, then copy the Settings handoff for frontend/runtime integration.',
        ownerSurface: 'delivery',
      },
      {
        key: 'security-keys-audit',
        label: 'Security, keys, and audit',
        status: securityReady ? 'ready' : 'attention',
        detail: securityReady
          ? 'Public/admin API keys and password policy are present; audit controls are exposed in Settings.'
          : 'Review API keys, password policy, session controls, and Settings audit visibility before launch.',
        nextAction: 'Open Security, regenerate keys if needed, enforce the password/session baseline, and confirm audit visibility.',
        ownerSurface: 'security',
      },
      {
        key: 'media-storage-runtime',
        label: 'Media storage runtime',
        status: storageConfigured ? 'ready' : 'blocked',
        detail: storageConfigured
          ? `${runtimeStorage?.provider || integrations.storage?.provider || 'configured'} storage is available for uploads, fonts, files, and frontend delivery.`
          : `Storage is missing ${runtimeStorage?.missing?.join(', ') || 'provider and bucket metadata'}.`,
        nextAction: 'Open Infrastructure and configure storage provider, bucket/public URL, allowed file types, and private file behavior.',
        ownerSurface: 'infrastructure',
        gate: 'npm run ci:settings-provider-certification',
      },
      {
        key: 'database-supabase-runtime',
        label: 'Database and Supabase runtime',
        status: databaseConfigured && supabaseConfigured && databaseMode !== 'demo' ? 'ready' : databaseConfigured ? 'attention' : 'blocked',
        detail: databaseConfigured && databaseMode !== 'demo'
          ? `${runtimeDatabase?.provider || 'database'} persistence is configured${runtimeDatabase?.host ? ` on ${runtimeDatabase.host}` : ''}.`
          : databaseConfigured
            ? 'Local/demo persistence is available, but production Supabase/Postgres certification is still required.'
            : `Database runtime is missing ${runtimeDatabase?.missing?.join(', ') || 'BACKY_DATABASE_URL or DATABASE_URL'}.`,
        nextAction: 'Run the disposable Supabase/Postgres release gate before treating Settings, Forms, and SDK persistence as production-ready.',
        ownerSurface: 'release',
        gate: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke',
      },
      {
        key: 'public-api-cors',
        label: 'Custom frontend CORS and headers',
        status: publicApiConfigured ? 'ready' : 'attention',
        detail: publicApiConfigured
          ? `${runtimePublicApi?.corsAllowedOriginCount || 0} exact frontend origin${runtimePublicApi?.corsAllowedOriginCount === 1 ? '' : 's'} configured with Backy contract headers exposed.`
          : 'Set exact custom frontend browser origins so public APIs expose Backy contract headers safely.',
        nextAction: 'Add BACKY_CORS_ALLOWED_ORIGINS for each deployed custom frontend origin before browser clients depend on public APIs.',
        ownerSurface: 'infrastructure',
        gate: 'npm run test:release-certification-preflight-contract',
      },
      {
        key: 'provider-certification-gate',
        label: 'Live provider certification',
        status: providerRuntimeInputsReady ? 'attention' : 'blocked',
        detail: providerRuntimeInputsReady
          ? 'Runtime inputs are present locally; Settings and Commerce still require credentialed provider certification before the Partial rows move to Ready.'
          : `Provider certification needs ${providerCertificationRuntimeEvidence.missingInputAliases.length ? providerCertificationRuntimeEvidence.missingInputAliases.join(', ') : 'live provider runtime inputs'}.`,
        nextAction: 'Use the provider command builder or release workflow with explicitly selected Settings and Commerce provider families.',
        ownerSurface: 'infrastructure',
        gate: 'npm run ci:settings-provider-certification',
      },
      {
        key: 'notifications-commerce-interactive',
        label: 'Notifications, commerce, and interactive runtime',
        status: notificationConfigured && commerceRuntimeReady && interactiveReady ? 'ready' : 'attention',
        detail: [
          notificationConfigured ? 'notifications ready' : 'notifications need provider/runtime review',
          commerceRuntimeReady ? 'commerce runtime safe for selected mode' : 'commerce webhook/provider secret evidence is missing',
          interactiveReady ? 'interactive component contract available' : 'interactive component sandbox needs configuration',
        ].join('; '),
        nextAction: 'Review Notifications, Commerce, and interactive component runtime evidence before enabling customer-facing workflows.',
        ownerSurface: 'infrastructure',
        gate: 'npm run ci:settings-provider-certification',
      },
    ];
    const score = Math.round((checks.filter((check) => check.status === 'ready').length / checks.length) * 100);
    const actionPlan = buildSettingsLaunchActionPlan(checks);

    return {
      generatedAt: new Date().toISOString(),
      schemaVersion: 'backy.settings-launch-readiness.v1',
      status: summarizeSettingsLaunchStatus(checks),
      score,
      delivery: {
        mode: deliveryMode,
        publicApiBase,
        adminApiBase,
        publicContracts: PUBLIC_API_ENDPOINTS.length,
        adminContracts: ADMIN_API_ENDPOINTS.length,
      },
      runtime: {
        databaseMode,
        databaseConfigured,
        supabaseConfigured,
        storageConfigured,
        vercelConfigured,
        publicApiConfigured,
        notificationConfigured,
        commerceRuntimeReady,
        interactiveReady,
      },
      certificationGates: {
        releaseWorkflow: '.github/workflows/backy-release-certification.yml',
        database: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke',
        formsDatabase: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres',
        settingsProviders: 'npm run ci:settings-provider-certification',
        commerceProviders: 'npm run ci:commerce-provider-certification',
        localPreflight: 'npm run test:partial-gate-preflights',
      },
      secretBoundary: {
        includesSecretValues: false,
        exportedEvidence: 'booleans, provider family labels, required aliases, gate names, endpoint templates, and runtime readiness only',
      },
      checks,
      actionPlan,
    };
  }, [
    adminApiBase,
    adminApiKey,
    authSettings?.minPasswordLength,
    deliveryMode,
    integrations.commerce,
    integrations.notifications,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    publicApiBase,
    publicApiKey,
    providerCertificationRuntimeEvidence,
    runtimeCommerce,
    runtimeDatabase,
    runtimeInteractiveComponents,
    runtimeNotifications,
    runtimePublicApi,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const settingsBackyCompletionStatus = useMemo(() => {
    const settingsGateReady = providerCertificationRuntimeEvidence.localRuntimeInputsConfigured;
    const commerceProviderScenario = providerCertificationScenarioEvidence.scenarios.find((scenario) => scenario.key === 'commerce-provider-bridge');
    const commerceGateReady = commerceProviderScenario?.status === 'covered';
    const databaseRuntime = {
      databaseMode: runtimeDatabase?.mode || 'unknown',
      databaseConfigured: Boolean(runtimeDatabase?.configured),
      publicApiReady: Boolean(runtimePublicApi?.corsAllowedOriginsConfigured && runtimePublicApi.exposedContractHeaders.length),
      scenarioEvidence: frontendDatabaseCertificationScenarioEvidence.schemaVersion,
      missingScenarios: frontendDatabaseCertificationScenarioEvidence.coverage.missing,
    };
    const providerRuntime = {
      settingsProviderEvidence: providerCertificationScenarioEvidence.schemaVersion,
      missingAliases: providerCertificationRuntimeEvidence.missingInputAliases,
      localRuntimeInputsConfigured: providerCertificationRuntimeEvidence.localRuntimeInputsConfigured,
    };
    const settingsMissingAliases = providerCertificationRuntimeEvidence.missingInputAliases;
    const commerceMissingScenarios = commerceProviderScenario?.status === 'covered'
      ? []
      : [commerceProviderScenario?.label || 'Commerce provider bridge'];
    const commerceRuntime = {
      settingsProviderEvidence: providerCertificationScenarioEvidence.schemaVersion,
      commerceProviderScenario: commerceProviderScenario || null,
      missingAliases: settingsMissingAliases,
      missingScenarios: commerceMissingScenarios,
      liveProviderGateRequired: true,
    };
    const certifiedGates: BackyCertifiedCompletionGate[] = [
      {
        key: 'forms-postgres',
        label: 'Forms Supabase/Postgres persistence',
        status: 'certified',
        command: 'npm run ci:forms-postgres',
        workflow: '.github/workflows/forms-postgres-contract.yml',
        affectedSurfaces: ['/forms'],
        certifiedAt: '2026-05-21',
        evidence: 'Passed against a migrated disposable local Postgres target with form definition, submission, contact, spam/consent, moderation, promotion, and cleanup coverage.',
        runtime: databaseRuntime,
      },
      {
        key: 'sdk-postgres',
        label: 'Frontend manifest/OpenAPI/SDK Supabase/Postgres smoke',
        status: 'certified',
        command: 'npm run ci:sdk-postgres-smoke',
        workflow: '.github/workflows/sdk-postgres-smoke.yml',
        affectedSurfaces: ['Frontend manifest/OpenAPI/SDK APIs'],
        certifiedAt: '2026-05-21',
        evidence: 'Passed against a migrated disposable local Postgres target with database-mode discovery, manifest, OpenAPI, render, media, CMS, forms, comments, events, commerce, and SDK write-flow coverage.',
        runtime: databaseRuntime,
      },
    ];
    const gates: BackyCompletionGate[] = [
      {
        key: 'settings-provider-certification',
        label: 'Settings live provider certification',
        status: settingsGateReady ? 'ready-to-run' : 'blocked-missing-inputs',
        command: SETTINGS_PROVIDER_CERTIFICATION_COMPLETION_COMMAND,
        workflow: '.github/workflows/settings-provider-certification.yml',
        affectedSurfaces: ['/settings', 'Settings admin APIs'],
        requiredEnvAliases: SETTINGS_PROVIDER_CERTIFICATION_GROUPS
          .filter((group) => !group.gate.includes('commerce'))
          .flatMap((group) => group.requiredInputs),
        runtime: providerRuntime,
      },
      {
        key: 'commerce-provider-certification',
        label: 'Commerce live provider certification',
        status: commerceGateReady ? 'ready-to-run' : 'blocked-missing-inputs',
        command: SETTINGS_COMMERCE_CERTIFICATION_COMPLETION_COMMAND,
        workflow: '.github/workflows/commerce-provider-certification.yml',
        affectedSurfaces: ['/products', '/orders'],
        requiredEnvAliases: SETTINGS_PROVIDER_CERTIFICATION_GROUPS
          .filter((group) => group.gate.includes('commerce'))
          .flatMap((group) => group.requiredInputs),
        runtime: {
          ...providerRuntime,
          commerceProviderScenario: commerceProviderScenario || null,
        },
      },
    ];
    const surfaceRunbooks: BackyCompletionSurfaceRunbook[] = [
      {
        key: 'settings',
        label: '/settings',
        gate: 'settings-provider-certification',
        command: SETTINGS_PROVIDER_CERTIFICATION_COMPLETION_COMMAND,
        preflight: 'npm run test:settings-provider-certification-preflight-contract',
        workflow: '.github/workflows/settings-provider-certification.yml',
        targetInputs: [
          'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
          'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
          'BACKY_SETTINGS_CERTIFY_SITE_ID',
          'BACKY_COMMERCE_CERTIFY_SITE_ID',
          `${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}`,
          `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_SETTINGS_CERTIFICATION_ARTIFACT`,
          `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
          'BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
        ],
        evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1',
        evidenceApi: '/api/admin/settings data.settings.providerCertification.operatorEvidencePacket',
        evidenceUiPanel: 'settings-provider-certification-evidence-packet',
        sourceOnlyGuard: 'BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin',
        proofSources: [
          'GET /api/admin/settings',
          'apps/admin/src/routes/settings.tsx',
          'scripts/settings-provider-certification-preflight-contract-smoke.mjs',
        ],
        expectedArtifacts: [
          'provider runtime alias summary',
          'operator evidence packet',
          'artifacts/backy-settings-provider-certification.json',
          'backy-settings-provider-certification-evidence',
          'Settings provider workflow summary',
          'release doctor summary',
        ],
        evidenceArtifacts: SETTINGS_COMPLETION_EVIDENCE_ARTIFACTS,
        artifactVerifier: SETTINGS_COMPLETION_ARTIFACT_VERIFIER,
        runtime: providerRuntime,
        secretBoundary: {
          includesSecretValues: false,
          excludes: ['database URLs', 'provider credentials', 'service-role keys', 'Vercel tokens', 'notification secrets', 'commerce secrets'],
        },
        nextAction: settingsMissingAliases.length > 0
          ? `Configure ${settingsMissingAliases.slice(0, 4).join(', ')} and run npm run ci:settings-provider-certification.`
          : 'Run npm run ci:settings-provider-certification and attach the redacted evidence packet.',
      },
      {
        key: 'settings-admin-apis',
        label: 'Settings admin APIs',
        gate: 'settings-provider-certification',
        command: SETTINGS_PROVIDER_CERTIFICATION_COMPLETION_COMMAND,
        preflight: 'npm run test:settings-provider-certification-preflight-contract',
        workflow: '.github/workflows/settings-provider-certification.yml',
        targetInputs: [
          'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
          'BACKY_SETTINGS_CERTIFY_SITE_ID',
          'BACKY_COMMERCE_CERTIFY_SITE_ID',
          `${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}`,
          `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_SETTINGS_CERTIFICATION_ARTIFACT`,
          `${SETTINGS_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
          'BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
        ],
        evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1',
        evidenceApi: '/api/admin/settings providerCertification plus site OpenAPI AdminSettingsProviderCertification',
        evidenceUiPanel: 'settings-provider-certification-evidence-packet',
        sourceOnlyGuard: 'BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin',
        proofSources: [
          'GET /api/admin/settings',
          '/api/sites/{siteId}/openapi AdminSettingsProviderCertification',
          'packages/sdk-js/src/generated-contract-types.ts',
        ],
        expectedArtifacts: [
          'typed AdminSettings providerCertification response',
          'operator evidence packet',
          'artifacts/backy-settings-provider-certification.json',
          'backy-settings-provider-certification-evidence',
          'Settings API no-secret response headers',
        ],
        evidenceArtifacts: SETTINGS_COMPLETION_EVIDENCE_ARTIFACTS,
        artifactVerifier: SETTINGS_COMPLETION_ARTIFACT_VERIFIER,
        runtime: providerRuntime,
        secretBoundary: {
          includesSecretValues: false,
          excludes: ['admin key values', 'database URLs', 'provider credentials', 'service-role keys'],
        },
        nextAction: settingsMissingAliases.length > 0
          ? `Configure ${settingsMissingAliases.slice(0, 4).join(', ')} and re-run the Settings admin API provider gate.`
          : 'Run the Settings provider gate and archive the typed admin API evidence packet.',
      },
      {
        key: 'products',
        label: '/products',
        gate: 'commerce-provider-certification',
        command: SETTINGS_COMMERCE_CERTIFICATION_COMPLETION_COMMAND,
        preflight: 'npm run test:commerce-provider-certification-preflight-contract',
        workflow: '.github/workflows/commerce-provider-certification.yml',
        targetInputs: [
          'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
          'BACKY_COMMERCE_CERTIFY_SITE_ID',
          `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT}`,
          `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT`,
          `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
          'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
        ],
        evidencePacketSchema: 'backy.commerce-provider-certification-evidence-packet.v1',
        evidenceApi: '/api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync data.providerCertification.operatorEvidencePacket',
        evidenceUiPanel: 'products-provider-certification-evidence-packet',
        sourceOnlyGuard: 'BACKY_COMMERCE_SOURCE_ONLY=1 npm run test:commerce --workspace @backy-cms/admin',
        proofSources: [
          'apps/admin/src/routes/products.tsx',
          'GET/POST /api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync',
          'scripts/commerce-provider-certification-preflight-contract-smoke.mjs',
        ],
        expectedArtifacts: [
          'product provider-sync evidence',
          'artifacts/backy-commerce-provider-certification.json',
          'backy-commerce-provider-certification-evidence',
          'product storefront handoff',
          'provider catalog sync proof',
          'subscription lifecycle proof when selected',
        ],
        evidenceArtifacts: COMMERCE_COMPLETION_EVIDENCE_ARTIFACTS,
        artifactVerifier: COMMERCE_COMPLETION_ARTIFACT_VERIFIER,
        runtime: commerceRuntime,
        secretBoundary: {
          includesSecretValues: false,
          excludes: ['provider secrets', 'raw provider responses', 'private orders', 'customer payloads', 'digital delivery URLs'],
        },
        nextAction: commerceMissingScenarios.length > 0
          ? 'Cover the Commerce provider bridge scenario, then run npm run ci:commerce-provider-certification.'
          : 'Run commerce provider certification and attach the products provider-sync evidence packet.',
      },
      {
        key: 'orders',
        label: '/orders',
        gate: 'commerce-provider-certification',
        command: SETTINGS_COMMERCE_CERTIFICATION_COMPLETION_COMMAND,
        preflight: 'npm run test:commerce-provider-certification-preflight-contract',
        workflow: '.github/workflows/commerce-provider-certification.yml',
        targetInputs: [
          'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
          'BACKY_COMMERCE_CERTIFY_SITE_ID',
          `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ENV}=${SETTINGS_NESTED_COMMERCE_CERTIFICATION_OUTPUT_ARTIFACT}`,
          `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT`,
          `${SETTINGS_NESTED_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
          'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
        ],
        evidencePacketSchema: 'backy.order-provider-certification-evidence-packet.v1',
        evidenceApi: '/api/admin/sites/{siteId}/commerce/orders/analytics data.providerCertification.operatorEvidencePacket',
        evidenceUiPanel: 'orders-provider-certification-evidence-packet',
        sourceOnlyGuard: 'BACKY_ORDERS_SOURCE_ONLY=1 npm run test:orders --workspace @backy-cms/admin',
        proofSources: [
          'apps/admin/src/routes/orders.tsx',
          'GET /api/admin/sites/{siteId}/commerce/orders/analytics',
          'scripts/commerce-provider-certification-preflight-contract-smoke.mjs',
        ],
        expectedArtifacts: [
          'order analytics provider evidence',
          'artifacts/backy-commerce-provider-certification.json',
          'backy-commerce-provider-certification-evidence',
          'status handoff evidence',
          'quote/tracking/fulfillment/refund proof',
          'webhook/reconciliation proof',
        ],
        evidenceArtifacts: COMMERCE_COMPLETION_EVIDENCE_ARTIFACTS,
        artifactVerifier: COMMERCE_COMPLETION_ARTIFACT_VERIFIER,
        runtime: commerceRuntime,
        secretBoundary: {
          includesSecretValues: false,
          excludes: ['provider secrets', 'customer payloads', 'raw order payloads', 'payment references', 'addresses', 'webhook bodies'],
        },
        nextAction: commerceMissingScenarios.length > 0
          ? 'Cover the Commerce provider bridge scenario, then run npm run ci:commerce-provider-certification.'
          : 'Run commerce provider certification and attach the orders analytics evidence packet.',
      },
    ];
    const blockedGates = gates.filter((gate) => gate.status !== 'ready-to-run');

    return {
      generatedAt: new Date().toISOString(),
      schemaVersion: 'backy.completion-status.v1',
      status: blockedGates.length === 0 ? 'certification-ready' : 'external-gates-required',
      summary: 'Backy has the core local backend/editor/API surface implemented for the current audit; Forms and SDK database gates are certified, and the remaining Partial rows need live provider certification evidence.',
      audit: BACKY_COMPLETION_AUDIT,
      surfaces: BACKY_COMPLETION_SURFACES,
      surfaceRunbooks,
      certifiedGates,
      gates,
      nextAction: blockedGates[0]
        ? `Run the ${blockedGates[0].label} command after configuring ${blockedGates[0].requiredEnvAliases.slice(0, 3).join(', ')}; it writes and verifies the certification artifact.`
        : 'Run the release certification workflow and attach evidence before moving the remaining Partial rows to Ready.',
      recommendedCommands: uniqueTextValues([
        'npm run test:partial-gate-preflights',
        ...gates.map((gate) => gate.command),
      ]),
      localPreflight: 'npm run test:partial-gate-preflights',
      linkedContracts: {
        publicManifest: '/api/sites/{siteId}/manifest#data.contract.completionStatus',
        openApi: '/api/sites/{siteId}/openapi#x-backy-completion-status',
        sdkTypes: ['BackyCompletionStatus', 'GeneratedBackyFrontendManifestCompletionStatus', 'GeneratedBackyOpenApiBackyCompletionStatus'],
      },
      privacy: {
        includesSecretValues: false,
        exposesOnlyAliasPresence: true,
        secretHandling: 'Completion status exposes audited counts, gate names, workflow paths, env alias presence, and missing provider families only; database URLs, provider keys, admin keys, and customer/order/submission payloads are never returned.',
      },
    };
  }, [
    frontendDatabaseCertificationScenarioEvidence,
    providerCertificationRuntimeEvidence,
    providerCertificationScenarioEvidence,
    runtimeDatabase,
    runtimePublicApi?.corsAllowedOriginsConfigured,
    runtimePublicApi?.exposedContractHeaders.length,
  ]);
  const settingsMediaStorageHandoff = useMemo(() => buildSettingsMediaStorageHandoff({
    integrations,
    runtimeStorage,
    runtimeSupabase,
    publicApiBase,
    adminApiBase,
  }), [
    adminApiBase,
    integrations,
    publicApiBase,
    runtimeStorage,
    runtimeSupabase,
  ]);
  const settingsThemeDesignImpact = useMemo(() => buildSettingsThemeDesignImpact({
    appearanceSettings,
    deliveryMode,
    publicApiBase,
    adminApiBase,
    validationIssues,
  }), [
    adminApiBase,
    appearanceSettings,
    deliveryMode,
    publicApiBase,
    validationIssues,
  ]);
  const settingsHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    completionStatus: settingsBackyCompletionStatus,
    launchReadiness: settingsLaunchReadiness,
    themeDesignImpact: settingsThemeDesignImpact,
    delivery: {
      mode: deliveryMode,
      publicApiBase,
      adminApiBase,
      publicSiteBase: publicApiBase.replace(/\/api$/, '/sites'),
    },
    endpoints: {
      public: PUBLIC_API_ENDPOINTS.map((endpoint) => ({
        ...endpoint,
        url: buildCopyText(publicApiBase, endpoint.path),
      })),
      admin: ADMIN_API_ENDPOINTS.map((endpoint) => ({
        ...endpoint,
        url: buildCopyText(adminApiBase, endpoint.path),
      })),
    },
    infrastructure: {
      storage: {
        runtime: runtimeStorage || null,
        metadata: integrations.storage || null,
        frontendHandoff: settingsMediaStorageHandoff,
        note: 'Storage provider metadata lives in Backy; bucket credentials and service keys stay in deployment environment variables.',
      },
      database: runtimeDatabase || null,
      supabase: {
        runtime: runtimeSupabase || null,
        metadata: integrations.supabase || null,
        note: 'Secrets and database URLs stay in deployment environment variables; Backy stores non-secret project metadata only.',
      },
      vercel: {
        runtime: runtimeVercel || null,
        metadata: integrations.vercel || null,
        note: 'Project ownership, domains, and preview-deploy preferences are tracked here; deploy tokens remain environment-managed.',
      },
      mediaScanner: runtimeMediaScanner || null,
      notifications: {
        runtime: runtimeNotifications || null,
        metadata: integrations.notifications || null,
        note: 'Notification preferences live in Backy; SMTP, Resend, and endpoint credentials stay in deployment environment variables.',
      },
      commerce: {
        runtime: runtimeCommerce || null,
        metadata: integrations.commerce || null,
        note: 'Commerce behavior lives in Backy; payment-provider API keys and webhook signing secrets stay in deployment environment variables.',
      },
      interactiveComponents: {
        runtime: runtimeInteractiveComponents || null,
        publicManifestPointer: '/api/sites/{siteId}/manifest#data.modules.interactiveComponents',
        elementTypes: ['interactiveFigure', 'codeComponent'],
        renderContract: {
          fields: ['componentKey', 'version', 'props', 'controls', 'dataBindings', 'fallback', 'accessibility', 'renderCapabilities'],
          hydrationModes: ['trusted-component', 'sandbox-iframe', 'static-fallback'],
          postMessageProtocol: 'backy.interactive-component.v1',
          fallbackRequired: true,
        },
        dataBindingScopes: ['collections', 'media', 'forms', 'commerce', 'page', 'blog'],
        safety: {
          customCodeRunsFrontendSide: true,
          parentDomAccess: false,
          parentCookieAccess: false,
          adminApiAccess: false,
          secretsInPayload: false,
          communication: 'postMessage-only',
        },
        note: 'Interactive animations execute in the frontend, while Backy owns the content model, registry metadata, allowed bindings, fallback content, publishing contract, and sandbox policy.',
      },
      envContract: infrastructureEnvContract,
      releaseCertification: {
        workflow: '.github/workflows/backy-release-certification.yml',
        localPreflight: 'npm run test:release-certification-preflight-contract',
        databaseGate: {
          input: 'certify_database',
          requiredSecret: 'BACKY_DATABASE_URL or DATABASE_URL',
          commands: ['npm run ci:forms-postgres', 'npm run ci:sdk-postgres-smoke'],
        },
        providerGates: [
          { input: 'certify_settings_providers', command: SETTINGS_PROVIDER_CERTIFICATION_COMPLETION_COMMAND },
          { input: 'certify_commerce_providers', command: SETTINGS_COMMERCE_CERTIFICATION_COMPLETION_COMMAND },
          { input: 'certify_storage', scope: 'live storage provisioning diagnostics' },
          { input: 'certify_rotation', scope: 'replacement storage credential validation' },
          { input: 'certify_vercel_secrets', scope: 'Vercel env secret-manager dry-run planning' },
          { input: 'certify_notification', scope: 'configured notification delivery diagnostics' },
        ],
        secretFamilies: [
          'BACKY_DATABASE_URL/DATABASE_URL',
          'BACKY_CORS_ALLOWED_ORIGINS for exact custom frontend browser origins',
          'BACKY_STORAGE_PROVIDER/BACKY_MEDIA_STORAGE_PROVIDER plus Supabase/S3 runtime aliases',
          'VERCEL_TOKEN/BACKY_VERCEL_TOKEN and project metadata',
          'notification aliases including RESEND_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
          'commerce provider aliases including STRIPE_SECRET_KEY, TAXJAR_API_KEY, PAYPAL_ACCESS_TOKEN, SHOPIFY_ADMIN_ACCESS_TOKEN, and COMMERCE_WEBHOOK_SECRET',
          'HTTP commerce endpoint aliases including COMMERCE_TAX_PROVIDER_URL, COMMERCE_SHIPPING_PROVIDER_URL, COMMERCE_DISCOUNT_PROVIDER_URL, COMMERCE_PRODUCT_SYNC_URL, and COMMERCE_SUBSCRIPTION_ACTION_URL',
        ],
      },
      providerCertification: providerCertificationHandoff,
      frontendDatabaseCertification: frontendDatabaseCertificationHandoff,
      publicApi: runtimePublicApi || null,
    },
    ownershipModel: PLATFORM_RESPONSIBILITIES,
    frontendApiCapabilities: FRONTEND_API_CAPABILITIES,
    backlog: PLATFORM_BACKLOG,
    frontendDefaults: {
      general: generalSettings,
      appearance: appearanceSettings,
      themeContract: buildAppearanceThemeContract(appearanceSettings),
      themeDesignImpact: settingsThemeDesignImpact,
      seo: seoSettings,
      notifications: notificationSettings,
      commerce: commerceSettings,
    },
    siteScopedSettings: siteSettingsScope
      ? {
          schemaVersion: siteSettingsScope.schemaVersion,
          scope: siteSettingsScope.scope,
          endpoints: siteSettingsScope.endpoints,
          frontendDatabaseCertification: siteSettingsScope.frontendDatabaseCertification || null,
          editableSections: ['seo', 'analytics', 'social', 'localization', 'commentPolicy'],
          savedSiteSettings: {
            seo: siteSettingsScope.siteSettings.seo,
            analytics: siteSettingsScope.siteSettings.analytics,
            social: siteSettingsScope.siteSettings.social,
            localization: siteSettingsScope.siteSettings.localization,
            commentPolicy: siteSettingsScope.siteSettings.commentPolicy,
          },
          draft: siteScopedSettingsPatchFromDraft(siteScopedSettingsDraft),
          dirty: hasSiteScopedSettingsUnsavedChanges,
          note: 'Site-scoped settings override workspace defaults for the selected site while keeping global Settings unchanged.',
        }
      : null,
    commerce: {
      settings: commerceSettings,
      note: 'Commerce settings control catalog/checkout intent for custom frontends; payment tokens and provider secrets stay outside Backy settings.',
    },
    security: {
      hasPublicApiKey: Boolean(publicApiKey),
      hasAdminApiKey: Boolean(adminApiKey),
      auth: normalizeAuthSettings(authSettings) || null,
    },
    readiness: platformReadiness,
    guardrails: [
      'Backy owns CMS data, editor content, API keys, forms, media metadata, and admin workflows.',
      'Supabase and Vercel are external providers connected through runtime env and non-secret metadata.',
      'Custom frontends should use public endpoints and design defaults; admin endpoints must remain private.',
      'Commerce controls exist in the admin model, but durable storefront checkout APIs are still a separate backend milestone.',
      'Infrastructure runtime cards show detected capability, while form fields store operator-controlled metadata.',
    ],
  }), [
    adminApiBase,
    adminApiKey,
    appearanceSettings,
    authSettings,
    commerceSettings,
    deliveryMode,
    generalSettings,
    integrations.commerce,
    integrations.notifications,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    infrastructureEnvContract,
    frontendDatabaseCertificationHandoff,
    notificationSettings,
    platformReadiness,
    providerCertificationHandoff,
    publicApiBase,
    publicApiKey,
    runtimeDatabase,
    runtimeCommerce,
    runtimeInteractiveComponents,
    runtimePublicApi,
    runtimeMediaScanner,
    runtimeNotifications,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
    seoSettings,
    settingsMediaStorageHandoff,
    settingsThemeDesignImpact,
    settingsBackyCompletionStatus,
    settingsLaunchReadiness,
    siteScopedSettingsDraft,
    hasSiteScopedSettingsUnsavedChanges,
    siteSettingsScope,
  ]);
  const settingsHandoffText = useMemo(() => JSON.stringify(settingsHandoff, null, 2), [settingsHandoff]);
  const settingsThemeDesignImpactText = useMemo(() => JSON.stringify(settingsThemeDesignImpact, null, 2), [settingsThemeDesignImpact]);
  const providerCertificationHandoffText = useMemo(() => JSON.stringify(providerCertificationHandoff, null, 2), [providerCertificationHandoff]);
  const frontendDatabaseCertificationHandoffText = useMemo(() => JSON.stringify(frontendDatabaseCertificationHandoff, null, 2), [frontendDatabaseCertificationHandoff]);
  const settingsLaunchReadinessText = useMemo(() => JSON.stringify(settingsLaunchReadiness, null, 2), [settingsLaunchReadiness]);
  const settingsBackyCompletionStatusText = useMemo(() => JSON.stringify(settingsBackyCompletionStatus, null, 2), [settingsBackyCompletionStatus]);

  const copySettingsHandoffText = async (value: string, label: string) => {
    if (isSaving) return;
    if (!canConfigureSettings) {
      setNotice(configurePermissionTitle || 'Your account cannot export settings handoff manifests.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const downloadSettingsHandoff = () => {
    if (isSaving) return;
    if (!canConfigureSettings) {
      setNotice(configurePermissionTitle || 'Your account cannot export settings handoff manifests.');
      return;
    }

    const blob = new Blob([settingsHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-settings-handoff.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Settings handoff manifest downloaded.');
  };

  const downloadProviderCertificationHandoff = () => {
    if (isSaving) return;
    if (!canConfigureSettings) {
      setNotice(configurePermissionTitle || 'Your account cannot export settings handoff manifests.');
      return;
    }

    const blob = new Blob([providerCertificationHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-settings-provider-certification-handoff.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Provider certification handoff downloaded.');
  };

  const downloadFrontendDatabaseCertificationHandoff = () => {
    if (isSaving) return;
    if (!canConfigureSettings) {
      setNotice(configurePermissionTitle || 'Your account cannot export settings handoff manifests.');
      return;
    }

    const blob = new Blob([frontendDatabaseCertificationHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-frontend-database-certification-handoff.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Frontend database certification handoff downloaded.');
  };

  const updateNotificationSettings = (next: Partial<NotificationSettingsConfig>) => {
    if (!canConfigureSettings) return;
    setIntegrations((current) => ({
      ...current,
      notifications: {
        ...(current.notifications || {}),
        ...next,
        ...(next.email ? { email: { ...(current.notifications?.email || {}), ...next.email } } : {}),
        ...(next.inApp ? { inApp: { ...(current.notifications?.inApp || {}), ...next.inApp } } : {}),
      },
    }));
  };
  const updateGeneralSettings = (next: Partial<GeneralSettingsConfig>) => {
    if (!canConfigureSettings) return;
    setIntegrations((current) => ({
      ...current,
      general: {
        ...(current.general || {}),
        ...next,
      },
    }));
  };
  const updateAppearanceSettings = (next: Partial<AppearanceSettingsConfig>) => {
    if (!canConfigureSettings) return;
    setIntegrations((current) => ({
      ...current,
      appearance: {
        ...(current.appearance || {}),
        ...next,
      },
    }));
  };
  const updateSeoSettings = (next: Partial<SeoSettingsConfig>) => {
    if (!canConfigureSettings) return;
    setIntegrations((current) => ({
      ...current,
      seo: {
        ...(current.seo || {}),
        ...next,
      },
    }));
  };
  const updateCommerceSettings = (next: Partial<CommerceSettingsConfig>) => {
    if (!canConfigureSettings) return;
    setIntegrations((current) => ({
      ...current,
      commerce: {
        ...(current.commerce || {}),
        ...next,
      },
    }));
  };
  const openSettingsTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    navigate({ to: '/settings', search: { tab }, replace: true });
    window.requestAnimationFrame(() => {
      document.getElementById('settings-tab-content')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  if (!isPermissionMatrixPending && !canViewSettings) {
    return (
      <div className="flex animate-fade-in flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Settings unavailable</h1>
          <p className="mt-1 text-muted-foreground">
            {viewPermissionTitle || 'Your account cannot view settings.'}
          </p>
        </div>
        <Notice
          tone="warning"
          title="Settings permissions could not be verified"
          role="alert"
          data-testid="settings-permission-state"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <span className="leading-6">
              {permissionError || viewPermissionTitle || 'Ask an owner or admin to grant settings.view access.'}
            </span>
            <Link
              to="/users"
              className="inline-flex shrink-0 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
            >
              Review users
            </Link>
          </div>
        </Notice>
      </div>
    );
  }

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Control delivery, infrastructure, design defaults, API keys, notifications, and security for every frontend.
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Settings header actions"
          aria-describedby={settingsWorkbarActionStatusId}
          data-testid="settings-header-action-group"
          data-action-state={settingsSaveDisabledReason ? 'blocked' : 'ready'}
          data-action-status={settingsWorkbarActionStatus}
        >
          <span
            id={settingsWorkbarActionStatusId}
            className="sr-only"
            data-testid="settings-workbar-action-status"
          >
            {settingsWorkbarActionStatus}
          </span>
          <span
            id={settingsHeaderSecondaryActionStatusId}
            className="sr-only"
            data-testid="settings-header-secondary-action-status"
          >
            {settingsHeaderSecondaryActionStatus}
          </span>
          {hasUnsavedChanges && (
            <Button
              variant="ghost"
              disabled={Boolean(settingsDiscardDisabledReason)}
              title={settingsDiscardDisabledReason || undefined}
              onClick={discardUnsavedChanges}
              aria-describedby={settingsWorkbarActionStatusId}
              data-action-state={settingsDiscardDisabledReason ? 'blocked' : 'ready'}
              data-action-status={settingsDiscardActionStatus}
              data-disabled-reason={settingsDiscardDisabledReason || undefined}
              data-testid="settings-header-discard"
            >
              Discard changes
            </Button>
          )}
          <details
            className="group relative"
            aria-describedby={settingsHeaderSecondaryActionStatusId}
            data-action-state={settingsHeaderSecondaryActionState}
            data-action-status={settingsHeaderSecondaryActionStatus}
            data-target-settings-tab={activeTab}
            data-testid="settings-header-secondary-actions"
            data-default-collapsed="true"
          >
            <summary
              className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-ring [&::-webkit-details-marker]:hidden"
              aria-label="More settings actions"
              aria-describedby={settingsHeaderSecondaryActionStatusId}
              data-testid="settings-header-more-actions"
            >
              <MoreHorizontal className="size-4" />
              More actions
              <span className="sr-only">Copy handoff and Download JSON</span>
            </summary>
            <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:min-w-52" data-testid="settings-header-secondary-action-menu">
              <button
                type="button"
                disabled={Boolean(settingsConfigureDisabledReason)}
                title={settingsConfigureDisabledReason || undefined}
                onClick={() => void copySettingsHandoffText(settingsHandoffText, 'Settings handoff manifest')}
                aria-describedby={settingsHeaderSecondaryActionStatusId}
                data-action-state={settingsHeaderSecondaryActionState}
                data-action-status={settingsCopyHandoffActionStatus}
                data-disabled-reason={settingsConfigureDisabledReason || undefined}
                data-target-settings-tab={activeTab}
                className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="settings-header-copy-handoff"
              >
                <Copy className="size-4" />
                Copy handoff
              </button>
              <button
                type="button"
                disabled={Boolean(settingsConfigureDisabledReason)}
                title={settingsConfigureDisabledReason || undefined}
                onClick={downloadSettingsHandoff}
                aria-describedby={settingsHeaderSecondaryActionStatusId}
                data-action-state={settingsHeaderSecondaryActionState}
                data-action-status={settingsDownloadJsonActionStatus}
                data-disabled-reason={settingsConfigureDisabledReason || undefined}
                data-target-settings-tab={activeTab}
                className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="settings-header-download-json"
              >
                <Download className="size-4" />
                Download JSON
              </button>
            </div>
          </details>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={saveButtonDisabled}
            title={settingsSaveDisabledReason || undefined}
            aria-describedby={settingsWorkbarActionStatusId}
            data-action-state={settingsSaveDisabledReason ? 'blocked' : 'ready'}
            data-action-status={settingsSaveActionStatus}
            data-disabled-reason={settingsSaveDisabledReason || undefined}
            iconStart={saved ? <Check className="size-4" /> : <Save className="size-4" />}
            data-testid="settings-header-save"
          >
            {saveButtonLabel}
          </Button>
        </div>
      </div>

      {notice && (
        <Notice tone="warning">{notice}</Notice>
      )}

      {permissionError && (
        <Notice
          tone="warning"
          title="Settings permissions could not be verified"
          role="alert"
          data-testid="settings-rbac-permission-state"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <span className="leading-6">{permissionError}</span>
            <Link
              to="/users"
              className="inline-flex shrink-0 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
            >
              Review users
            </Link>
          </div>
        </Notice>
      )}

      {(canUseSettingsRoleDefaults || isPermissionMatrixPending) && (
        <Notice
          tone="info"
          title="Settings permissions syncing"
          data-testid="settings-permission-sync-state"
        >
          {canUseSettingsRoleDefaults
            ? 'Using owner/admin role defaults while detailed settings permissions sync.'
            : 'Loading detailed settings permissions before enabling role-specific controls.'}
        </Notice>
      )}

      {hasUnsavedChanges && activeBlockingValidationIssues.length === 0 && (
        <Notice tone="info" title="Unsaved settings">
          Review the current tab or save changes to update Backy’s API, frontend handoff, infrastructure metadata, and security policy.
        </Notice>
      )}

      {validationIssues.length > 0 && (
        <SettingsValidationSummary
          issues={validationIssues}
          onOpenTab={openSettingsTab}
        />
      )}

      <div
        className="sticky top-2 z-20 -mx-4 rounded-none border-y border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur sm:mx-0 sm:rounded-xl sm:border"
        aria-describedby={settingsWorkbarActionStatusId}
        aria-label="Settings sticky workbar"
        data-action-state={settingsSaveDisabledReason ? 'blocked' : 'ready'}
        data-action-status={settingsWorkbarActionStatus}
        data-testid="settings-sticky-workbar"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {ActiveTabIcon ? <ActiveTabIcon className="size-4 shrink-0 text-primary" /> : null}
              <span className="text-sm font-semibold text-foreground" data-testid="settings-sticky-active-tab">
                {activeTabMeta.name}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', activeSettingsStatusTone)}>
                {activeSettingsStatusLabel}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {activeSettingsHelperText}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openSettingsTab(previousSettingsTab.id)}
              aria-label={`Open previous Settings section: ${previousSettingsTab.name}`}
              aria-describedby={settingsWorkbarActionStatusId}
              data-action-state="ready"
              data-action-status={settingsPreviousTabActionStatus}
              data-testid="settings-sticky-previous-tab"
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openSettingsTab(nextSettingsTab.id)}
              aria-label={`Open next Settings section: ${nextSettingsTab.name}`}
              aria-describedby={settingsWorkbarActionStatusId}
              data-action-state="ready"
              data-action-status={settingsNextTabActionStatus}
              data-testid="settings-sticky-next-tab"
            >
              Next
            </Button>
            {hasUnsavedChanges && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={Boolean(settingsDiscardDisabledReason)}
                title={settingsDiscardDisabledReason || undefined}
                onClick={discardUnsavedChanges}
                aria-describedby={settingsWorkbarActionStatusId}
                data-action-state={settingsDiscardDisabledReason ? 'blocked' : 'ready'}
                data-action-status={settingsDiscardActionStatus}
                data-disabled-reason={settingsDiscardDisabledReason || undefined}
                data-testid="settings-sticky-discard"
              >
                Discard
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => void handleSave()}
              disabled={saveButtonDisabled}
              title={settingsSaveDisabledReason || undefined}
              aria-describedby={settingsWorkbarActionStatusId}
              data-action-state={settingsSaveDisabledReason ? 'blocked' : 'ready'}
              data-action-status={settingsSaveActionStatus}
              data-disabled-reason={settingsSaveDisabledReason || undefined}
              iconStart={saved ? <Check className="size-4" /> : <Save className="size-4" />}
              data-testid="settings-sticky-save"
            >
              {saveButtonLabel}
            </Button>
          </div>
        </div>
        <nav
          aria-label="Settings page shortcuts"
          className="mt-3 flex gap-1 overflow-x-auto pb-1"
          data-testid="settings-sticky-section-nav"
        >
          {SETTINGS_WORKBAR_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-ring"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>

      <div id="settings-command-center" className="scroll-mt-24" data-testid="settings-command-center">
        <Panel>
          <PanelHeader
            title="Settings command center"
            description="One place to see whether Backy can securely power managed sites, custom frontends, media, database-backed content, Supabase, and Vercel deploy workflows."
            icon={<Server className="size-4" />}
            action={
              <span className={cn(
                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                platformReadiness.score >= 80
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
              )}
              >
                {platformReadiness.score}% ready
              </span>
            }
          />
          <PanelContent>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Backend control health</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Checks the pieces a Wix/WordPress-style backend needs before frontends depend on it.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {deliveryMode === 'custom-frontend' ? 'Headless' : 'Managed'}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      platformReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                    )}
                    style={{ width: `${platformReadiness.score}%` }}
                  />
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {platformReadiness.checks.map((check) => (
                    <SettingsReadinessCheck key={check.label} {...check} />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Setup workflow</h3>
                </div>
                <div className="mt-3 grid gap-2">
                  {platformReadiness.workflow.map((step, index) => (
                    <SettingsWorkflowStep key={step.label} index={index + 1} {...step} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="settings-launch-readiness">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">Settings launch readiness</h3>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', SETTINGS_LAUNCH_STATUS_STYLES[settingsLaunchReadiness.status])}>
                      {SETTINGS_LAUNCH_STATUS_LABELS[settingsLaunchReadiness.status]}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Copy this launch handoff before treating Backy as the backend for managed sites or custom frontends. It keeps provider secrets out of the payload while naming the database, provider, CORS, API, media, and release gates still needed for production.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving || !canConfigureSettings}
                  title={configurePermissionTitle}
                  onClick={() => void copySettingsHandoffText(settingsLaunchReadinessText, 'Settings launch readiness handoff')}
                  iconStart={<Copy className="size-4" />}
                  data-testid="settings-launch-readiness-copy-button"
                >
                  Copy launch JSON
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Schema', value: settingsLaunchReadiness.schemaVersion },
                  { label: 'Launch score', value: `${settingsLaunchReadiness.score}%` },
                  { label: 'Provider gate', value: settingsLaunchReadiness.certificationGates.settingsProviders },
                  { label: 'Database gate', value: settingsLaunchReadiness.certificationGates.database },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                    <div className="mt-1 break-words font-mono text-[11px] leading-4 text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>
              <details className="mt-3 rounded-md border border-border bg-muted/10 p-3" data-testid="settings-launch-readiness-details" data-default-collapsed="true">
                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Launch action plan and gate detail</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Expand when you need the full operator handoff, recommended commands, and per-gate status.
                    </p>
                  </div>
                  <span className="rounded bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    {settingsLaunchReadiness.checks.length} checks
                  </span>
                </summary>
                <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="settings-launch-readiness-action-plan">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-foreground">Action plan</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{settingsLaunchReadiness.actionPlan.nextAction}</p>
                    </div>
                    <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {settingsLaunchReadiness.actionPlan.schemaVersion}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {settingsLaunchReadiness.actionPlan.recommendedCommands.length ? settingsLaunchReadiness.actionPlan.recommendedCommands.map((command) => (
                      <span key={command} className="max-w-full break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {command}
                      </span>
                    )) : (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        .github/workflows/backy-release-certification.yml
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {settingsLaunchReadiness.checks.map((check) => (
                    <div key={check.key} className="rounded-md border border-border bg-card px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-semibold text-foreground">{check.label}</div>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', SETTINGS_LAUNCH_STATUS_STYLES[check.status])}>
                          {SETTINGS_LAUNCH_STATUS_LABELS[check.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="settings-backy-completion-status">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">Backy completion status</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {settingsBackyCompletionStatus.audit.ready} Ready / {settingsBackyCompletionStatus.audit.partial} Partial
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {settingsBackyCompletionStatus.status}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    This is the same non-secret completion handoff exposed to custom admin clients through the public manifest and OpenAPI. It names the remaining Partial pages, proving gates, workflows, and env aliases without exposing database URLs, provider keys, order records, or form submissions.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving || !canConfigureSettings}
                  title={configurePermissionTitle}
                  onClick={() => void copySettingsHandoffText(settingsBackyCompletionStatusText, 'Backy completion status handoff')}
                  iconStart={<Copy className="size-4" />}
                  data-testid="settings-backy-completion-status-copy-button"
                >
                  Copy status JSON
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: 'Schema', value: settingsBackyCompletionStatus.schemaVersion },
                  { label: 'Audit', value: `${settingsBackyCompletionStatus.audit.readyPercent}% ready` },
                  { label: 'Partial surfaces', value: `${settingsBackyCompletionStatus.surfaces.length}` },
                  { label: 'Local preflight', value: settingsBackyCompletionStatus.localPreflight },
                  { label: 'Public contract', value: 'data.contract.completionStatus' },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                    <div className="mt-1 break-words font-mono text-[11px] leading-4 text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>
              <div
                className="mt-3 grid gap-2 lg:grid-cols-2"
                data-testid="settings-backy-completion-closure-summary"
                data-partial-count={settingsBackyCompletionStatus.audit.partial}
              >
                {settingsBackyCompletionStatus.gates.map((gate) => {
                  const affectedSurfaces = settingsBackyCompletionStatus.surfaces
                    .filter((surface) => surface.blocker === gate.key)
                    .map((surface) => surface.label);
                  const relatedRunbooks = settingsBackyCompletionStatus.surfaceRunbooks.filter((runbook) => runbook.gate === gate.key);
                  const relatedRunbookLabels = relatedRunbooks.map((runbook) => runbook.label);
                  const artifactPaths = uniqueTextValues(relatedRunbooks.flatMap((runbook) => runbook.evidenceArtifacts.map((artifact) => artifact.path)));
                  const verifierCommands = uniqueTextValues(relatedRunbooks.map((runbook) => runbook.artifactVerifier.command));
                  const copyActionStatus = getSettingsCompletionGateCopyActionStatus(gate);

                  return (
                    <div
                      key={gate.key}
                      className="rounded-md border border-border bg-background px-3 py-3"
                      data-testid={`settings-backy-completion-closure-gate-${gate.key}`}
                      data-gate-status={gate.status}
                      data-affected-surfaces={affectedSurfaces.join(', ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-xs font-semibold text-foreground">{gate.label}</h4>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', BACKY_COMPLETION_GATE_STYLES[gate.status])}>
                              {BACKY_COMPLETION_GATE_LABELS[gate.status]}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Closes {affectedSurfaces.join(', ')} after the redacted provider artifact passes the doctor.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={Boolean(settingsConfigureDisabledReason)}
                          title={settingsConfigureDisabledReason || undefined}
                          aria-label={`Copy ${gate.label} certification command`}
                          data-testid={`settings-backy-completion-closure-copy-${gate.key}`}
                          data-action-state={settingsConfigureDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={copyActionStatus}
                          data-disabled-reason={settingsConfigureDisabledReason || undefined}
                          onClick={() => void copySettingsHandoffText(gate.command, `${gate.label} certification command`)}
                        >
                          Copy command
                        </Button>
                      </div>
                      <div className="mt-2 break-words rounded border border-border bg-muted/20 px-2 py-1.5 font-mono text-[10px] leading-4 text-foreground">
                        {gate.command}
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Runbooks</div>
                          <div className="mt-1 break-words font-mono text-[10px] leading-4 text-foreground">
                            {relatedRunbookLabels.length > 0 ? relatedRunbookLabels.join(', ') : 'No mapped runbooks'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Artifacts</div>
                          <div className="mt-1 break-words font-mono text-[10px] leading-4 text-foreground">
                            {artifactPaths.length > 0 ? artifactPaths.join(', ') : 'Attach certification artifact'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Verifier</div>
                          <div className="mt-1 break-words font-mono text-[10px] leading-4 text-foreground">
                            {verifierCommands.length > 0 ? verifierCommands.join(', ') : 'npm run doctor:release-certification'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <details className="mt-3 rounded-md border border-border bg-muted/10 p-3" data-testid="settings-backy-completion-status-details" data-default-collapsed="true">
                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Partial gates and runbooks</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Expand for the operator commands, evidence paths, and remaining external certification gates.
                    </p>
                  </div>
                  <span className="rounded bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    {settingsBackyCompletionStatus.audit.partial} partial
                  </span>
                </summary>
                <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="settings-backy-completion-status-action-plan">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-foreground">Next action</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{settingsBackyCompletionStatus.nextAction}</p>
                    </div>
                    <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      x-backy-completion-status
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {settingsBackyCompletionStatus.recommendedCommands.map((command) => (
                      <span key={command} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {command}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-4" data-testid="settings-backy-completion-status-gates">
                  {settingsBackyCompletionStatus.gates.map((gate) => (
                    <div key={gate.key} className="rounded-md border border-border bg-card px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-semibold text-foreground">{gate.label}</div>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', BACKY_COMPLETION_GATE_STYLES[gate.status])}>
                          {BACKY_COMPLETION_GATE_LABELS[gate.status]}
                        </span>
                      </div>
                      <div className="mt-2 break-words font-mono text-[11px] leading-4 text-muted-foreground">{gate.command}</div>
                      <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                        Affects {gate.affectedSurfaces.join(', ')}.
                      </div>
                    </div>
                  ))}
                </div>
                <details className="mt-3 rounded-md border border-border bg-background p-3" data-testid="settings-backy-completion-status-runbooks" data-default-collapsed="true">
                  <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Partial surface runbooks</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Copyable per-page runbooks mirror completionStatus.surfaceRunbooks for operator handoff and custom admin frontends.
                    </p>
                  </div>
                  <span className="rounded bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    surfaceRunbooks
                  </span>
                </summary>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {settingsBackyCompletionStatus.surfaceRunbooks.map((runbook) => (
                    <div
                      key={runbook.key}
                      className="rounded-md border border-border bg-card px-3 py-2"
                      data-testid={`settings-backy-completion-status-runbook-${runbook.key}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-foreground">{runbook.label}</div>
                          <div className="mt-1 break-words font-mono text-[10px] leading-4 text-muted-foreground">{runbook.gate}</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSaving || !canConfigureSettings}
                          title={configurePermissionTitle}
                          onClick={() => void copySettingsHandoffText(JSON.stringify(runbook, null, 2), `${runbook.label} completion runbook`)}
                          iconStart={<Copy className="size-4" />}
                          data-testid={`settings-backy-completion-status-runbook-copy-${runbook.key}`}
                        >
                          Copy runbook
                        </Button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence packet</div>
                          <div className="mt-1 break-words font-mono text-[10px] leading-4 text-foreground">{runbook.evidencePacketSchema}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source guard</div>
                          <div className="mt-1 break-words font-mono text-[10px] leading-4 text-foreground">{runbook.sourceOnlyGuard}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                        Evidence API: <span className="break-words font-mono text-[10px] text-foreground">{runbook.evidenceApi}</span>
                      </div>
                      <div className="mt-2 rounded border border-border bg-background px-2.5 py-2" data-testid={`settings-backy-completion-status-runbook-artifacts-${runbook.key}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence artifact</div>
                        {runbook.evidenceArtifacts.map((artifact) => (
                          <div key={artifact.key} className="mt-1 grid gap-1 text-[11px] leading-4 text-muted-foreground">
                            <div className="font-semibold text-foreground">{artifact.label}</div>
                            <div className="break-words font-mono text-[10px] text-foreground">{artifact.artifactName}</div>
                            <div className="break-words font-mono text-[10px]">{artifact.path}</div>
                            <div className="break-words font-mono text-[10px]">{artifact.schemaVersion}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 rounded border border-border bg-background px-2.5 py-2" data-testid={`settings-backy-completion-status-runbook-verifier-${runbook.key}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Artifact verifier</div>
                        <div className="mt-1 break-words font-mono text-[10px] leading-4 text-foreground">{runbook.artifactVerifier.command}</div>
                        <div className="mt-1 break-words font-mono text-[10px] leading-4 text-muted-foreground">{runbook.artifactVerifier.requiredEnv}</div>
                        <div className="mt-1 break-words text-[10px] leading-4 text-muted-foreground">
                          Freshness: {runbook.artifactVerifier.freshnessWindow.defaultMaxAgeHours}h max via <span className="font-mono">{runbook.artifactVerifier.freshnessWindow.maxAgeHoursEnv}</span>; future skew {runbook.artifactVerifier.freshnessWindow.defaultFutureSkewMinutes}m via <span className="font-mono">{runbook.artifactVerifier.freshnessWindow.futureSkewMinutesEnv}</span>.
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {runbook.artifactVerifier.validates.slice(0, 7).map((check) => (
                            <span key={check} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {check}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        Secret boundary: no secret values; excludes {runbook.secretBoundary.excludes.slice(0, 4).join(', ')}.
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {runbook.targetInputs.map((input) => (
                          <span key={input} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {input}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{runbook.nextAction}</p>
                    </div>
                  ))}
                </div>
                </details>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {settingsBackyCompletionStatus.surfaces.map((surface) => (
                    <span key={surface.key} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                      {surface.label}: {surface.blocker}
                    </span>
                  ))}
                </div>
              </details>
            </div>

            <details
              className="group mt-4 overflow-hidden rounded-lg border border-border bg-background"
              data-default-collapsed="true"
              data-testid="settings-command-maps"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-sm font-semibold text-foreground">Ownership, controls, and frontend API maps</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Reference maps for platform ownership, Settings tabs, and custom frontend API coverage.</span>
                </span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show maps</span>
                <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide maps</span>
              </summary>
              <div className="space-y-4 border-t border-border p-4">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Platform ownership map</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Backy owns the CMS, editor, media metadata, commerce records, APIs, and admin workflows. Supabase and Vercel are connected providers for hosted database/storage and deployment runtime.
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {PLATFORM_RESPONSIBILITIES.length} control areas
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3" data-testid="settings-platform-ownership-map">
                    {PLATFORM_RESPONSIBILITIES.map((item) => (
                      <SettingsResponsibilityCard key={item.area} item={item} />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Settings control map</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Jump to the settings that control public APIs, visual defaults, infrastructure, notifications, and security.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openSettingsTab('infrastructure')}
                      iconStart={<Cloud className="size-4" />}
                    >
                      Open infrastructure
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {SETTINGS_CONTROL_AREAS.map((area) => (
                      <button
                        key={area.title}
                        type="button"
                        onClick={() => openSettingsTab(area.tab)}
                        className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="text-sm font-semibold text-foreground">{area.title}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Frontend API capability map</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        What a custom frontend can already consume from Backy, and which Wix/Webflow/Squarespace-level backend pieces still need product work.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openSettingsTab('delivery')}
                      iconStart={<Code className="size-4" />}
                    >
                      Open API delivery
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {FRONTEND_API_CAPABILITIES.map((capability) => (
                      <SettingsCapabilityCard key={capability.area} capability={capability} />
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </PanelContent>
        </Panel>
      </div>

      {/* Tabs */}
      <div id="settings-tabs" className="scroll-mt-24">
        <SegmentedTabs
          items={TABS}
          value={activeTab}
          onChange={openSettingsTab}
          ariaLabel="Settings sections"
          getPanelId={() => 'settings-tab-content'}
        />
      </div>

      {/* Tab Content */}
      <Panel id="settings-tab-content" className="scroll-mt-24" role="tabpanel">
        <PanelContent className="pt-5">
        <fieldset
          disabled={activeTab === 'security'
            ? isSaving || (!canConfigureSettings && !canManageApiKeys)
            : activeTab === 'infrastructure'
              ? infrastructureFormDisabled
              : settingsFormDisabled}
          className="contents disabled:cursor-not-allowed"
          title={activeTab === 'infrastructure' ? infrastructurePermissionTitle : configurePermissionTitle}
        >
        {activeTab === 'general' && (
          <GeneralSettings value={generalSettings} onChange={updateGeneralSettings} />
        )}
        {activeTab === 'appearance' && (
          <AppearanceSettings
            value={appearanceSettings}
            themeDesignImpact={settingsThemeDesignImpact}
            onCopyThemeDesignImpact={() => void copySettingsHandoffText(settingsThemeDesignImpactText, 'Theme design impact handoff')}
            onChange={updateAppearanceSettings}
          />
        )}
        {activeTab === 'seo' && (
          <SEOSettings value={seoSettings} onChange={updateSeoSettings} />
        )}
        {activeTab === 'delivery' && (
          <DeliveryModeSettings
            value={deliveryMode}
            runtimeDatabase={runtimeDatabase}
            runtimePublicApi={runtimePublicApi}
            runtimeStorage={runtimeStorage}
            frontendDatabaseCertificationScenarioEvidence={frontendDatabaseCertificationScenarioEvidence}
            frontendDatabaseCertificationControlsDisabled={isSaving || !canConfigureSettings}
            frontendDatabaseCertificationControlsTitle={configurePermissionTitle}
            onCopyFrontendDatabaseCertificationHandoff={() => void copySettingsHandoffText(frontendDatabaseCertificationHandoffText, 'Frontend database certification handoff')}
            onDownloadFrontendDatabaseCertificationHandoff={downloadFrontendDatabaseCertificationHandoff}
            onChange={setDeliveryMode}
          />
        )}
        {activeTab === 'infrastructure' && (
          <InfrastructureSettings
            integrations={integrations}
            deliveryMode={deliveryMode}
            runtimeDatabase={runtimeDatabase}
            runtimeStorage={runtimeStorage}
            runtimeSupabase={runtimeSupabase}
            runtimeMediaScanner={runtimeMediaScanner}
            runtimeVercel={runtimeVercel}
            runtimeNotifications={runtimeNotifications}
            runtimeCommerce={runtimeCommerce}
            runtimeInteractiveComponents={runtimeInteractiveComponents}
            runtimePublicApi={runtimePublicApi}
            envContract={infrastructureEnvContract}
            disabled={infrastructureFormDisabled}
            mediaOnly={isMediaOnlyInfrastructureEditor}
            providerCertificationControlsDisabled={isSaving || !canConfigureSettings}
            providerCertificationControlsTitle={configurePermissionTitle}
            providerCertificationScenarioEvidence={providerCertificationScenarioEvidence}
            onCopyProviderCertificationHandoff={() => void copySettingsHandoffText(providerCertificationHandoffText, 'Provider certification handoff')}
            onDownloadProviderCertificationHandoff={downloadProviderCertificationHandoff}
            onChange={setIntegrations}
          />
        )}
        {activeTab === 'commerce' && (
          <CommerceSettings
            value={commerceSettings}
            onChange={updateCommerceSettings}
          />
        )}
        {activeTab === 'notifications' && (
          <NotificationSettings
            value={notificationSettings}
            onChange={updateNotificationSettings}
            delivery={notificationWebhookDelivery}
            deliveryLoading={isNotificationWebhookTesting}
            webhookUrlError={notificationWebhookUrlInlineError}
            onTestWebhook={() => handleTestNotificationWebhook()}
            onRetryWebhook={() => handleTestNotificationWebhook(notificationWebhookDelivery?.requestId)}
            disabled={settingsFormDisabled}
          />
        )}
        {activeTab === 'security' && (
          <SecuritySettings
            publicApiKey={publicApiKey}
            adminApiKey={adminApiKey}
            authSettings={authSettings}
            onAuthSettingsChange={setAuthSettings}
            onRegenerateKeys={handleRegenerateKeys}
            onIssueAdminApiKey={handleIssueAdminApiKey}
            onRevokeAdminApiKey={handleRevokeAdminApiKey}
            currentSession={currentSession}
            onRotateCurrentSession={handleRotateCurrentSession}
            isRotatingSession={isRotatingSession}
            sessionRotationNotice={sessionRotationNotice}
            canManageApiKeys={canManageApiKeys}
            canConfigureSettings={canConfigureSettings}
            manageKeysPermissionTitle={manageKeysPermissionTitle}
            configurePermissionTitle={configurePermissionTitle}
            auditLogs={settingsAuditLogs}
            isAuditLoading={isAuditLoading}
            auditNotice={auditNotice}
            canExportActivity={canExportActivity}
            activityExportPermissionTitle={activityExportPermissionTitle}
            onRefreshAudit={() => void loadSettingsAuditLogs()}
          />
        )}
        </fieldset>
        {activeTab === 'general' && (
          <SiteScopedSettingsPanel
            sites={siteSettingsSites}
            selectedSiteId={selectedSiteSettingsSiteId}
            scope={siteSettingsScope}
            value={siteScopedSettingsDraft}
            loading={isSiteSettingsLoading}
            saving={isSiteSettingsSaving}
            notice={siteSettingsNotice}
            hasUnsavedChanges={hasSiteScopedSettingsUnsavedChanges}
            auditLogs={siteSettingsAuditLogs}
            auditLoading={isSiteSettingsAuditLoading}
            auditNotice={siteSettingsAuditNotice}
            canViewAudit={canExportActivity}
            auditPermissionTitle={activityExportPermissionTitle}
            disabled={isSiteSettingsLoading || isSiteSettingsSaving || !canConfigureSiteSettings}
            canView={canViewSiteSettings}
            permissionTitle={siteSettingsConfigurePermissionTitle}
            onSelectSite={setSelectedSiteSettingsSiteId}
            onChange={setSiteScopedSettingsDraft}
            onDiscard={handleDiscardSiteScopedSettings}
            onSave={() => void handleSaveSiteScopedSettings()}
          />
        )}
        </PanelContent>
      </Panel>
    </div>
  );
}

function SettingsReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
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

function SettingsWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
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

function SettingsCapabilityCard({ capability }: { capability: FrontendApiCapability }) {
  const statusLabel = {
    ready: 'Ready',
    partial: 'Partial',
    planned: 'Planned',
  }[capability.status];
  const statusClassName = {
    ready: 'bg-emerald-50 text-emerald-700',
    partial: 'bg-amber-50 text-amber-700',
    planned: 'bg-slate-100 text-slate-600',
  }[capability.status];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="min-w-0 text-sm font-semibold text-foreground">{capability.area}</h4>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', statusClassName)}>
          {statusLabel}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-5">
        <div>
          <dt className="font-semibold text-foreground">Contract</dt>
          <dd className="text-muted-foreground">{capability.contract}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Admin controls</dt>
          <dd className="text-muted-foreground">{capability.controls}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Still needed</dt>
          <dd className="text-muted-foreground">{capability.stillNeeded}</dd>
        </div>
      </dl>
    </div>
  );
}

function SettingsResponsibilityCard({ item }: { item: ResponsibilityArea }) {
  const ownerClassName = {
    'Backy in-house': 'bg-emerald-50 text-emerald-700',
    'Supabase connection': 'bg-sky-50 text-sky-700',
    'Vercel connection': 'bg-slate-100 text-slate-700',
  }[item.owner];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 text-sm font-semibold text-foreground">{item.area}</h4>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', ownerClassName)}>
          {item.owner}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-5">
        <div>
          <dt className="font-semibold text-foreground">Control surface</dt>
          <dd className="text-muted-foreground">{item.controlSurface}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Runtime source</dt>
          <dd className="text-muted-foreground">{item.runtimeSource}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Frontend impact</dt>
          <dd className="text-muted-foreground">{item.frontendImpact}</dd>
        </div>
      </dl>
    </div>
  );
}

function SettingsValidationSummary({
  issues,
  onOpenTab,
}: {
  issues: SettingsValidationIssue[];
  onOpenTab: (tab: SettingsTab) => void;
}) {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const groupedIssues = SETTINGS_TAB_IDS
    .map((tab) => ({
      tab,
      label: TABS.find((item) => item.id === tab)?.name || tab,
      issues: issues.filter((issue) => issue.tab === tab),
    }))
    .filter((group) => group.issues.length > 0);

  return (
    <Notice
      tone={errorCount > 0 ? 'error' : 'warning'}
      title={errorCount > 0 ? 'Settings need attention before saving' : 'Settings recommendations'}
    >
      <div className="grid gap-3">
        <p>
          {errorCount > 0
            ? `${errorCount} blocking issue${errorCount === 1 ? '' : 's'} must be fixed.`
            : 'These recommendations will make the frontend handoff more reliable.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {groupedIssues.map((group) => (
            <button
              key={group.tab}
              type="button"
              onClick={() => onOpenTab(group.tab)}
              className="rounded-lg border border-current/20 bg-background/70 px-2.5 py-1 text-xs font-semibold transition hover:bg-background"
            >
              {group.label}: {group.issues.length}
            </button>
          ))}
        </div>
        <ul className="grid gap-1 text-xs leading-5">
          {issues.slice(0, 4).map((issue) => (
            <li key={`${issue.tab}-${issue.label}`}>
              <span className="font-semibold">{issue.label}:</span> {issue.detail}
            </li>
          ))}
        </ul>
      </div>
    </Notice>
  );
}

// ============================================
// GENERAL SETTINGS
// ============================================

function GeneralSettings({
  value,
  onChange,
}: {
  value: GeneralSettingsConfig;
  onChange: (next: Partial<GeneralSettingsConfig>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Site Information</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="settings-site-name" className="block text-sm font-medium mb-1">
              Site Name
            </label>
            <input
              id="settings-site-name"
              type="text"
              value={value.siteName || ''}
              onChange={(event) => onChange({ siteName: event.target.value })}
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>

          <div>
            <label htmlFor="settings-site-description" className="block text-sm font-medium mb-1">
              Site Description
            </label>
            <textarea
              id="settings-site-description"
              value={value.siteDescription || ''}
              onChange={(event) => onChange({ siteDescription: event.target.value })}
              rows={3}
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring resize-none'
              )}
            />
          </div>

          <div>
            <label htmlFor="settings-timezone" className="block text-sm font-medium mb-1">
              Timezone
            </label>
            <select
              id="settings-timezone"
              value={value.timezone || DEFAULT_GENERAL_SETTINGS.timezone}
              onChange={(event) => onChange({ timezone: event.target.value })}
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function SiteScopedSettingsPanel({
  sites,
  selectedSiteId,
  scope,
  value,
  loading,
  saving,
  notice,
  hasUnsavedChanges,
  auditLogs,
  auditLoading,
  auditNotice,
  canViewAudit,
  auditPermissionTitle,
  disabled,
  canView,
  permissionTitle,
  onSelectSite,
  onChange,
  onDiscard,
  onSave,
}: {
  sites: Site[];
  selectedSiteId: string;
  scope: AdminSiteSettingsScope | null;
  value: SiteScopedSettingsDraft;
  loading: boolean;
  saving: boolean;
  notice: string | null;
  hasUnsavedChanges: boolean;
  auditLogs: AdminAuditLog[];
  auditLoading: boolean;
  auditNotice: string | null;
  canViewAudit: boolean;
  auditPermissionTitle?: string;
  disabled: boolean;
  canView: boolean;
  permissionTitle?: string;
  onSelectSite: (siteId: string) => void;
  onChange: Dispatch<SetStateAction<SiteScopedSettingsDraft>>;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const blockedTerms = value.blockedTerms
    .split('\n')
    .map((term) => term.trim())
    .filter(Boolean);
  const siteScopeActionStatusId = 'settings-site-scope-action-status';
  const siteScopeBusyReason = saving
    ? 'Site-scoped settings are saving.'
    : loading
      ? 'Site-scoped settings are loading.'
      : null;
  const siteScopeSelectDisabledReason = siteScopeBusyReason
    || (sites.length === 0 ? 'No sites are available for site-scoped settings.' : null);
  const siteScopeDiscardDisabledReason = siteScopeBusyReason
    || (disabled ? permissionTitle || 'Your account cannot configure site-scoped settings.' : null)
    || (!selectedSiteId ? 'Select a site before discarding site-scoped changes.' : null)
    || (!hasUnsavedChanges ? 'No unsaved site-scoped settings changes to discard.' : null);
  const siteScopeSaveDisabledReason = siteScopeBusyReason
    || (disabled ? permissionTitle || 'Your account cannot configure site-scoped settings.' : null)
    || (!selectedSiteId ? 'Select a site before saving site-scoped settings.' : null)
    || (!hasUnsavedChanges ? 'Make a site-scoped settings change before saving.' : null);
  const siteScopeSelectActionStatus = siteScopeSelectDisabledReason
    ? `Site selector unavailable: ${siteScopeSelectDisabledReason}`
    : 'Site selector available.';
  const siteScopeDiscardActionStatus = siteScopeDiscardDisabledReason
    ? `Discard site changes unavailable: ${siteScopeDiscardDisabledReason}`
    : 'Discard site changes available.';
  const siteScopeSaveActionStatus = siteScopeSaveDisabledReason
    ? `Save site settings unavailable: ${siteScopeSaveDisabledReason}`
    : 'Save site settings available.';
  const siteScopeActionStatus = [
    siteScopeSelectActionStatus,
    siteScopeDiscardActionStatus,
    siteScopeSaveActionStatus,
  ].join(' ');

  if (!canView) {
    return (
      <details
        className="group mt-6 overflow-hidden rounded-lg border border-border bg-muted/30"
        data-default-collapsed="true"
        data-testid="settings-site-scope-details"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-semibold text-foreground">Site-scoped settings</span>
            <span className="mt-1 block text-sm text-muted-foreground">Per-site SEO, analytics, localization, and comment-policy overrides.</span>
          </span>
          <span className="shrink-0 rounded-md bg-background px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show site controls</span>
          <span className="hidden shrink-0 rounded-md bg-background px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide site controls</span>
        </summary>
        <div className="border-t border-border p-4" data-testid="settings-site-scope-panel">
          <h3 className="text-sm font-semibold">Site-scoped settings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Site settings are hidden until your account can view sites.
          </p>
        </div>
      </details>
    );
  }

  return (
    <details
      className="group mt-6 overflow-hidden rounded-lg border border-border bg-background"
      data-default-collapsed="true"
      data-testid="settings-site-scope-details"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Site-scoped settings</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {scope?.schemaVersion || 'backy.site-settings-scope.v1'}
            </span>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Per-site SEO, analytics, localization, comment-policy, API scope, and audit controls for {selectedSite?.name || selectedSite?.slug || scope?.scope.siteSlug || 'the selected site'}.
          </span>
        </span>
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show site controls</span>
        <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide site controls</span>
      </summary>
      <div className="border-t border-border p-4" data-testid="settings-site-scope-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Site-scoped settings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace defaults stay global. These controls save only to the selected site's scoped settings contract.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {scope?.schemaVersion || 'backy.site-settings-scope.v1'}
        </span>
      </div>

      {notice && (
        <div className="mt-3">
          <Notice tone={notice.includes('saved') ? 'success' : 'warning'}>{notice}</Notice>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          <div>
            <label htmlFor="settings-site-scope-site" className="block text-sm font-medium">
              Site
            </label>
            <select
              id="settings-site-scope-site"
              data-testid="settings-site-scope-site"
              value={selectedSiteId}
              onChange={(event) => onSelectSite(event.target.value)}
              disabled={Boolean(siteScopeSelectDisabledReason)}
              title={siteScopeSelectDisabledReason || undefined}
              aria-describedby={siteScopeActionStatusId}
              data-action-state={siteScopeSelectDisabledReason ? 'blocked' : 'ready'}
              data-action-status={siteScopeSelectActionStatus}
              data-disabled-reason={siteScopeSelectDisabledReason || undefined}
              className={cn(
                'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            >
              {sites.length === 0 && <option value="">No sites available</option>}
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name || site.slug}
                </option>
              ))}
            </select>
          </div>

          <dl className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5">
            <div>
              <dt className="font-semibold text-foreground">Selected site</dt>
              <dd className="text-muted-foreground">{selectedSite?.slug || scope?.scope.siteSlug || 'None'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Scope</dt>
              <dd className="text-muted-foreground">
                workspace: {scope?.scope.workspaceSettingsScope || 'global'} / site: {scope?.scope.siteSettingsScope || 'site'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Endpoint</dt>
              <dd className="break-all text-muted-foreground">{scope?.endpoints.siteSettings || '/api/admin/sites/:siteId/settings'}</dd>
            </div>
            <div data-testid="settings-site-scope-frontend-database-certification">
              <dt className="font-semibold text-foreground">Database gate</dt>
              <dd className="text-muted-foreground">
                {scope?.frontendDatabaseCertification?.schemaVersion || 'backy.frontend-database-certification.v1'}
                {' / '}
                {scope?.frontendDatabaseCertification?.status || 'external-database-gate'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="settings-site-scope-title-template" className="block text-sm font-medium">
                Site SEO title template
              </label>
              <input
                id="settings-site-scope-title-template"
                data-testid="settings-site-scope-title-template"
                type="text"
                value={value.titleTemplate}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({ ...current, titleTemplate: event.target.value }))}
                className={cn(
                  'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
            </div>

            <div>
              <label htmlFor="settings-site-scope-description" className="block text-sm font-medium">
                Site default description
              </label>
              <textarea
                id="settings-site-scope-description"
                data-testid="settings-site-scope-description"
                rows={4}
                value={value.defaultDescription}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({ ...current, defaultDescription: event.target.value }))}
                className={cn(
                  'mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="settings-site-scope-ga" className="block text-sm font-medium">
                Google Analytics ID
              </label>
              <input
                id="settings-site-scope-ga"
                data-testid="settings-site-scope-ga"
                type="text"
                value={value.googleAnalyticsId}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({ ...current, googleAnalyticsId: event.target.value }))}
                className={cn(
                  'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
            </div>

            <div>
              <label htmlFor="settings-site-scope-plausible" className="block text-sm font-medium">
                Plausible domain
              </label>
              <input
                id="settings-site-scope-plausible"
                data-testid="settings-site-scope-plausible"
                type="text"
                value={value.plausibleDomain}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({ ...current, plausibleDomain: event.target.value }))}
                className={cn(
                  'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div>
                <label htmlFor="settings-site-scope-twitter" className="block text-sm font-medium">
                  Twitter
                </label>
                <input
                  id="settings-site-scope-twitter"
                  data-testid="settings-site-scope-twitter"
                  type="url"
                  value={value.twitter}
                  disabled={disabled || !selectedSiteId}
                  onChange={(event) => onChange((current) => ({ ...current, twitter: event.target.value }))}
                  className={cn(
                    'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                  )}
                />
              </div>
              <div>
                <label htmlFor="settings-site-scope-github" className="block text-sm font-medium">
                  GitHub
                </label>
                <input
                  id="settings-site-scope-github"
                  data-testid="settings-site-scope-github"
                  type="url"
                  value={value.github}
                  disabled={disabled || !selectedSiteId}
                  onChange={(event) => onChange((current) => ({ ...current, github: event.target.value }))}
                  className={cn(
                    'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                  )}
                />
              </div>
              <div>
                <label htmlFor="settings-site-scope-linkedin" className="block text-sm font-medium">
                  LinkedIn
                </label>
                <input
                  id="settings-site-scope-linkedin"
                  data-testid="settings-site-scope-linkedin"
                  type="url"
                  value={value.linkedin}
                  disabled={disabled || !selectedSiteId}
                  onChange={(event) => onChange((current) => ({ ...current, linkedin: event.target.value }))}
                  className={cn(
                    'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                  )}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="settings-site-scope-default-locale" className="block text-sm font-medium">
                Default locale
              </label>
              <input
                id="settings-site-scope-default-locale"
                data-testid="settings-site-scope-default-locale"
                type="text"
                value={value.defaultLocale}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({ ...current, defaultLocale: event.target.value }))}
                className={cn(
                  'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
            </div>

            <div>
              <label htmlFor="settings-site-scope-locale-strategy" className="block text-sm font-medium">
                Locale routing
              </label>
              <select
                id="settings-site-scope-locale-strategy"
                data-testid="settings-site-scope-locale-strategy"
                value={value.localeStrategy}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({
                  ...current,
                  localeStrategy: event.target.value === 'domain'
                    ? 'domain'
                    : event.target.value === 'path-prefix'
                      ? 'path-prefix'
                      : 'none',
                }))}
                className={cn(
                  'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              >
                <option value="none">None</option>
                <option value="path-prefix">Path prefix</option>
                <option value="domain">Domain</option>
              </select>
            </div>

            <div>
              <label htmlFor="settings-site-scope-locales" className="block text-sm font-medium">
                Locale entries
              </label>
              <textarea
                id="settings-site-scope-locales"
                data-testid="settings-site-scope-locales"
                rows={4}
                value={value.locales}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({ ...current, locales: event.target.value }))}
                className={cn(
                  'mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One locale per line: code | label | direction | pathPrefix | domain
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="settings-site-scope-moderation" className="block text-sm font-medium">
                Comment moderation
              </label>
              <select
                id="settings-site-scope-moderation"
                data-testid="settings-site-scope-moderation"
                value={value.moderationMode}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({
                  ...current,
                  moderationMode: event.target.value === 'auto-approve' ? 'auto-approve' : 'manual',
                }))}
                className={cn(
                  'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              >
                <option value="manual">Manual review</option>
                <option value="auto-approve">Auto approve</option>
              </select>
            </div>

            <div>
              <label htmlFor="settings-site-scope-blocked-terms" className="block text-sm font-medium">
                Blocked comment terms
              </label>
              <textarea
                id="settings-site-scope-blocked-terms"
                data-testid="settings-site-scope-blocked-terms"
                rows={4}
                value={value.blockedTerms}
                disabled={disabled || !selectedSiteId}
                onChange={(event) => onChange((current) => ({ ...current, blockedTerms: event.target.value }))}
                className={cn(
                  'mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {blockedTerms.length} normalized term{blockedTerms.length === 1 ? '' : 's'} will be saved.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
        role="group"
        aria-label="Site-scoped settings actions"
        aria-describedby={siteScopeActionStatusId}
        data-testid="settings-site-scope-action-group"
        data-action-state={siteScopeSaveDisabledReason ? 'blocked' : 'ready'}
        data-action-status={siteScopeActionStatus}
      >
        <span
          id={siteScopeActionStatusId}
          className="sr-only"
          data-testid="settings-site-scope-action-status"
        >
          {siteScopeActionStatus}
        </span>
        <p className="text-xs leading-5 text-muted-foreground">
          The save request patches only allowlisted site sections and records a site-scoped audit event.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(siteScopeDiscardDisabledReason)}
            title={siteScopeDiscardDisabledReason || undefined}
            aria-describedby={siteScopeActionStatusId}
            data-action-state={siteScopeDiscardDisabledReason ? 'blocked' : 'ready'}
            data-action-status={siteScopeDiscardActionStatus}
            data-disabled-reason={siteScopeDiscardDisabledReason || undefined}
            data-testid="settings-site-scope-discard"
            onClick={onDiscard}
          >
            Discard site changes
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={Boolean(siteScopeSaveDisabledReason)}
            title={siteScopeSaveDisabledReason || undefined}
            aria-describedby={siteScopeActionStatusId}
            data-action-state={siteScopeSaveDisabledReason ? 'blocked' : 'ready'}
            data-action-status={siteScopeSaveActionStatus}
            data-disabled-reason={siteScopeSaveDisabledReason || undefined}
            data-testid="settings-site-scope-save"
            onClick={onSave}
            iconStart={saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
          >
            {saving ? 'Saving...' : hasUnsavedChanges ? 'Save site settings' : 'No site changes'}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3" data-testid="settings-site-scope-audit">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Site settings audit</h4>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Recent request-id events for this selected site's scoped settings.
            </p>
          </div>
          <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {canViewAudit ? `${auditLogs.length} event${auditLogs.length === 1 ? '' : 's'}` : 'Hidden'}
          </span>
        </div>

        {!canViewAudit ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground" title={auditPermissionTitle}>
            Audit activity requires activity export permission.
          </p>
        ) : auditLoading ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Loading site settings audit...</p>
        ) : auditNotice ? (
          <Notice tone="warning" className="mt-3">{auditNotice}</Notice>
        ) : auditLogs.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={History}
              title="No site settings updates yet"
              description="Save scoped SEO, analytics, localization, or comment policy changes to start this request-id audit trail."
            />
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
            {auditLogs.map((log) => {
              const changedKeys = Array.isArray(log.metadata?.changedKeys)
                ? log.metadata.changedKeys.filter((key): key is string => typeof key === 'string')
                : [];
              return (
                <div key={log.id} className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{auditTitle(log)}</p>
                    <p className="mt-1 text-muted-foreground">{changedKeys.length ? `Changed ${changedKeys.join(', ')}` : auditDescription(log)}</p>
                    {log.requestId && (
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{log.requestId}</p>
                    )}
                  </div>
                  <div className="text-left text-muted-foreground md:text-right">
                    <p>{formatAuditTime(log.createdAt)}</p>
                    <p className="mt-1">{log.actorId || 'admin'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </details>
  );
}

// ============================================
// APPEARANCE SETTINGS
// ============================================

function AppearanceSettings({
  value,
  themeDesignImpact,
  onCopyThemeDesignImpact,
  onChange,
}: {
  value: AppearanceSettingsConfig;
  themeDesignImpact: ReturnType<typeof buildSettingsThemeDesignImpact>;
  onCopyThemeDesignImpact: () => void;
  onChange: (next: Partial<AppearanceSettingsConfig>) => void;
}) {
  const resolved = resolveAppearanceSettings(value);
  const colorControls = [
    { key: 'primaryColor', label: 'Primary', variable: '--backy-color-primary' },
    { key: 'secondaryColor', label: 'Secondary', variable: '--backy-color-secondary' },
    { key: 'backgroundColor', label: 'Background', variable: '--backy-color-background' },
    { key: 'surfaceColor', label: 'Surface', variable: '--backy-color-surface' },
    { key: 'textColor', label: 'Text', variable: '--backy-color-text' },
    { key: 'mutedTextColor', label: 'Muted text', variable: '--backy-color-muted-text' },
  ] as const;
	  const themeContract = buildAppearanceThemeContract(value);
	  const baseFontSizeInvalid = !Number.isFinite(resolved.baseFontSize) || resolved.baseFontSize < 12 || resolved.baseFontSize > 24;
	  const radiusInvalid = !Number.isFinite(resolved.radius) || resolved.radius < 0 || resolved.radius > 32;
	  const spacingUnitInvalid = !Number.isFinite(resolved.spacingUnit) || resolved.spacingUnit < 2 || resolved.spacingUnit > 16;

	  const updateColor = (key: typeof colorControls[number]['key'], nextValue: string) => {
	    onChange({ [key]: nextValue });
	  };
  const updateNumber = (key: 'baseFontSize' | 'radius' | 'spacingUnit', nextValue: number) => {
    onChange({ [key]: nextValue });
  };

  return (
    <div className="space-y-6">
      <div>
	        <h3 className="mb-4 text-lg font-semibold">Theme colors</h3>
	        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
	          {colorControls.map((control) => {
	            const colorInvalid = !HEX_COLOR_REGEX.test(resolved[control.key]);
	            const errorId = `settings-${control.key}-error`;

	            return (
	              <div key={control.key} className="rounded-lg border border-border bg-background p-3">
	                <label htmlFor={`settings-${control.key}`} className="block text-sm font-medium">
	                  {control.label}
	                </label>
	                <div className="mt-2 flex items-center gap-2">
	                  <input
	                    id={`settings-${control.key}`}
	                    type="color"
	                    value={colorInputValue(resolved[control.key], DEFAULT_APPEARANCE_SETTINGS[control.key])}
	                    onChange={(event) => updateColor(control.key, event.target.value)}
	                    className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border"
	                    data-testid={`settings-${control.key}-color-input`}
	                  />
	                  <input
	                    type="text"
	                    aria-label={`${control.label} color hex`}
	                    aria-invalid={colorInvalid}
	                    aria-describedby={colorInvalid ? errorId : undefined}
	                    value={resolved[control.key]}
	                    onChange={(event) => updateColor(control.key, event.target.value)}
	                    className={cn(
	                      'min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-sm',
	                      'focus:outline-none focus:ring-2 focus:ring-ring',
	                      colorInvalid && 'border-destructive text-destructive focus:ring-destructive/30',
	                    )}
	                    data-testid={`settings-${control.key}-hex-input`}
	                  />
	                </div>
	                {colorInvalid ? (
	                  <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-destructive" data-testid={`settings-${control.key}-error`}>
	                    {control.label} must use a six-character hex value like #0f172a.
	                  </p>
	                ) : null}
	                <div className="mt-2 font-mono text-[11px] text-muted-foreground">{control.variable}</div>
	              </div>
	            );
	          })}
	        </div>
	      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">Typography and layout tokens</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { key: 'headingFontFamily', label: 'Heading font' },
            { key: 'bodyFontFamily', label: 'Body font' },
            { key: 'monoFontFamily', label: 'Mono font' },
          ].map((control) => (
            <label key={control.key} className="space-y-2 text-sm">
              <span className="font-medium">{control.label}</span>
              <select
                value={String(resolved[control.key as keyof typeof resolved] || '')}
                onChange={(event) => onChange({ [control.key]: event.target.value })}
                className={cn(
                  'w-full rounded-lg border bg-background px-3 py-2',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              >
                {FONT_FAMILY_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>{font.label}</option>
                ))}
              </select>
            </label>
          ))}

          <label htmlFor="settings-base-font-size" className="space-y-2 text-sm">
            <span className="font-medium">Base font size</span>
	            <input
	              id="settings-base-font-size"
	              type="number"
	              value={resolved.baseFontSize}
	              onChange={(event) => updateNumber('baseFontSize', Number(event.target.value))}
	              min={12}
	              max={24}
	              aria-invalid={baseFontSizeInvalid}
	              aria-describedby={baseFontSizeInvalid ? 'settings-base-font-size-error' : undefined}
	              className={cn(
	                'w-full rounded-lg border bg-background px-3 py-2',
	                'focus:outline-none focus:ring-2 focus:ring-ring',
	                baseFontSizeInvalid && 'border-destructive text-destructive focus:ring-destructive/30',
	              )}
	              data-testid="settings-base-font-size-input"
	            />
	            {baseFontSizeInvalid ? (
	              <p id="settings-base-font-size-error" role="alert" className="text-xs font-medium text-destructive" data-testid="settings-base-font-size-error">
	                Use a base font size from 12 to 24 pixels.
	              </p>
	            ) : null}
	          </label>

	          <label htmlFor="settings-radius" className="space-y-2 text-sm">
	            <span className="font-medium">Corner radius</span>
	            <input
              id="settings-radius"
              type="number"
              value={resolved.radius}
	              onChange={(event) => updateNumber('radius', Number(event.target.value))}
	              min={0}
	              max={32}
	              aria-invalid={radiusInvalid}
	              aria-describedby={radiusInvalid ? 'settings-radius-error' : undefined}
	              className={cn(
	                'w-full rounded-lg border bg-background px-3 py-2',
	                'focus:outline-none focus:ring-2 focus:ring-ring',
	                radiusInvalid && 'border-destructive text-destructive focus:ring-destructive/30',
	              )}
	              data-testid="settings-radius-input"
	            />
	            {radiusInvalid ? (
	              <p id="settings-radius-error" role="alert" className="text-xs font-medium text-destructive" data-testid="settings-radius-error">
	                Use a corner radius from 0 to 32 pixels.
	              </p>
	            ) : null}
	          </label>

	          <label htmlFor="settings-spacing-unit" className="space-y-2 text-sm">
	            <span className="font-medium">Spacing unit</span>
	            <input
              id="settings-spacing-unit"
              type="number"
              value={resolved.spacingUnit}
	              onChange={(event) => updateNumber('spacingUnit', Number(event.target.value))}
	              min={2}
	              max={16}
	              aria-invalid={spacingUnitInvalid}
	              aria-describedby={spacingUnitInvalid ? 'settings-spacing-unit-error' : undefined}
	              className={cn(
	                'w-full rounded-lg border bg-background px-3 py-2',
	                'focus:outline-none focus:ring-2 focus:ring-ring',
	                spacingUnitInvalid && 'border-destructive text-destructive focus:ring-destructive/30',
	              )}
	              data-testid="settings-spacing-unit-input"
	            />
	            {spacingUnitInvalid ? (
	              <p id="settings-spacing-unit-error" role="alert" className="text-xs font-medium text-destructive" data-testid="settings-spacing-unit-error">
	                Use a spacing unit from 2 to 16 pixels.
	              </p>
	            ) : null}
	          </label>

	          <label htmlFor="settings-motion-preset" className="space-y-2 text-sm">
	            <span className="font-medium">Motion preset</span>
	            <select
              id="settings-motion-preset"
              value={resolved.motionPreset}
              onChange={(event) => onChange({ motionPreset: event.target.value })}
              className={cn(
	                'w-full rounded-lg border bg-background px-3 py-2',
	                'focus:outline-none focus:ring-2 focus:ring-ring',
	              )}
	              data-testid="settings-motion-preset-select"
	            >
              {MOTION_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
          </label>
	        </div>
	      </div>

      <div
        className="rounded-lg border border-border bg-background p-4"
        data-testid="settings-theme-design-impact"
        data-schema-version={themeDesignImpact.schemaVersion}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Theme design impact</h3>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                themeDesignImpact.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
              )}
              >
                {themeDesignImpact.status}
              </span>
              <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {themeDesignImpact.schemaVersion}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Copy the global token, motion, and editable design-state contract before wiring a custom frontend theme system.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onCopyThemeDesignImpact}
            iconStart={<Copy className="size-4" />}
            data-testid="settings-theme-design-impact-copy-button"
          >
            Copy design impact
          </Button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {[
            { label: 'CSS variables', value: String(themeDesignImpact.impact.cssVariableCount) },
            { label: 'Editable surfaces', value: String(themeDesignImpact.designStatePersistence.editableSurfaces.length) },
            { label: 'Motion bindings', value: String(themeDesignImpact.motion.bindingPaths.length) },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
              <div className="text-muted-foreground">{item.label}</div>
              <div className="mt-1 font-semibold text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="settings-theme-design-impact-token-paths">
          {themeDesignImpact.designStatePersistence.tokenRefPaths.map((path) => (
            <span key={path} className="rounded-full border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {path}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <div
          className="rounded-lg border border-border p-5"
          style={{
            backgroundColor: resolved.backgroundColor,
            color: resolved.textColor,
            borderRadius: resolved.radius,
          }}
        >
          <div
            className="rounded-lg border p-4"
            style={{
              backgroundColor: resolved.surfaceColor,
              borderColor: resolved.mutedTextColor,
              borderRadius: resolved.radius,
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: resolved.mutedTextColor }}>
              Theme preview
            </div>
            <h4 className="mt-3 text-2xl font-semibold" style={{ fontFamily: resolved.headingFontFamily }}>
              Designed from Backy tokens
            </h4>
            <p className="mt-2 text-sm leading-6" style={{ color: resolved.mutedTextColor, fontFamily: resolved.bodyFontFamily || resolved.fontFamily }}>
              Custom frontends can consume these colors, type roles, spacing, radius, and motion defaults from Settings.
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{
                backgroundColor: resolved.primaryColor,
                color: resolved.backgroundColor,
                borderRadius: resolved.radius,
              }}
            >
              Primary action
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Frontend theme contract</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This token payload is included in the Settings handoff manifest and can drive any custom frontend design system.
          </p>
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
{JSON.stringify(themeContract, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SEO SETTINGS
// ============================================

function SEOSettings({
  value,
  onChange,
}: {
  value: SeoSettingsConfig;
  onChange: (next: Partial<SeoSettingsConfig>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Default SEO Settings</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-title-template" className="block text-sm font-medium mb-1">
              Default Title Template
            </label>
            <input
              id="settings-title-template"
              type="text"
              value={value.titleTemplate || ''}
              onChange={(event) => onChange({ titleTemplate: event.target.value })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use %s for the page title
            </p>
          </div>

          <div>
            <label htmlFor="settings-meta-description" className="block text-sm font-medium mb-1">
              Default Meta Description
            </label>
            <textarea
              id="settings-meta-description"
              value={value.metaDescription || ''}
              onChange={(event) => onChange({ metaDescription: event.target.value })}
              rows={3}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring resize-none'
              )}
            />
          </div>

          <div>
            <label htmlFor="settings-keywords" className="block text-sm font-medium mb-1">
              Default Keywords
            </label>
            <input
              id="settings-keywords"
              type="text"
              value={value.keywords || ''}
              onChange={(event) => onChange({ keywords: event.target.value })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Social Sharing</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-og-image" className="block text-sm font-medium mb-1">
              Default OG Image URL
            </label>
            <input
              id="settings-og-image"
              type="url"
              value={value.ogImageUrl || ''}
              onChange={(event) => onChange({ ogImageUrl: event.target.value })}
              placeholder="https://example.com/og-image.jpg"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Analytics</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-analytics-id" className="block text-sm font-medium mb-1">
              Google Analytics ID
            </label>
            <input
              id="settings-analytics-id"
              type="text"
              value={value.analyticsId || ''}
              onChange={(event) => onChange({ analyticsId: event.target.value })}
              placeholder="G-XXXXXXXXXX"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// DELIVERY + API SETTINGS
// ============================================

function EndpointBlock({
  title,
  baseUrl,
  endpoints,
  copiedEndpoint,
  onCopy,
}: {
  title: string;
  baseUrl: string;
  endpoints: ApiEndpoint[];
  copiedEndpoint: string;
  onCopy: (url: string) => void;
}) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <PanelContent>
        <ul className="flex flex-col gap-3 text-sm">
          {endpoints.map((endpoint) => {
            const fullUrl = buildCopyText(baseUrl, endpoint.path);
            return (
              <li
                key={`${title}-${endpoint.method}-${endpoint.path}`}
                className="rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs text-foreground">
                      <span className="mr-2 inline-flex items-center rounded bg-muted px-2 py-0.5 font-bold">
                        {endpoint.method}
                      </span>
                      {fullUrl}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {endpoint.description}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onCopy(fullUrl)}
                    className={copiedEndpoint === fullUrl ? 'text-success' : undefined}
                  >
                    {copiedEndpoint === fullUrl ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </PanelContent>
    </Panel>
  );
}

function DeliveryModeSettings({
  value,
  runtimeDatabase,
  runtimePublicApi,
  runtimeStorage,
  frontendDatabaseCertificationScenarioEvidence,
  frontendDatabaseCertificationControlsDisabled = false,
  frontendDatabaseCertificationControlsTitle,
  onCopyFrontendDatabaseCertificationHandoff,
  onDownloadFrontendDatabaseCertificationHandoff,
  onChange,
}: {
  value: DeliveryMode;
  runtimeDatabase?: SiteSettingsInput['runtimeDatabase'];
  runtimePublicApi?: SiteSettingsInput['runtimePublicApi'];
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  frontendDatabaseCertificationScenarioEvidence: ReturnType<typeof buildFrontendDatabaseCertificationScenarioEvidence>;
  frontendDatabaseCertificationControlsDisabled?: boolean;
  frontendDatabaseCertificationControlsTitle?: string;
  onCopyFrontendDatabaseCertificationHandoff: () => void;
  onDownloadFrontendDatabaseCertificationHandoff: () => void;
  onChange: (next: DeliveryMode) => void;
}) {
  const [copiedEndpoint, setCopiedEndpoint] = useState('');
  const [frontendDatabaseCommandOptions, setFrontendDatabaseCommandOptions] = useState<FrontendDatabaseCertificationCommandOptions>(
    DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS,
  );
  const [copiedFrontendDatabaseCommand, setCopiedFrontendDatabaseCommand] = useState(false);
  const [copiedFrontendDatabaseEnvTemplate, setCopiedFrontendDatabaseEnvTemplate] = useState(false);
  const publicApiBase = getApiBase('public');
  const adminApiBase = getApiBase('admin');
  const publicHostBase = publicApiBase.replace(/\/api$/, '');
  const publicSiteBase = `${publicHostBase}/sites`;
  const frontendDatabaseCertificationCommand = useMemo(
    () => buildFrontendDatabaseCertificationCommand(frontendDatabaseCommandOptions),
    [frontendDatabaseCommandOptions],
  );
  const frontendDatabaseCertificationEnvTemplate = useMemo(
    () => buildFrontendDatabaseCertificationEnvTemplate(frontendDatabaseCommandOptions),
    [frontendDatabaseCommandOptions],
  );
  const frontendDatabaseCertificationRequiredInputs = useMemo(
    () => buildFrontendDatabaseCertificationRequiredInputs(frontendDatabaseCommandOptions),
    [frontendDatabaseCommandOptions],
  );
  const frontendDatabaseCertificationChecks = [
    {
      label: 'Database runtime',
      ready: Boolean(runtimeDatabase?.mode === 'database' && runtimeDatabase.configured),
      detail: runtimeDatabase
        ? runtimeDatabase.configured
          ? `${runtimeDatabase.provider || runtimeDatabase.mode} runtime is configured.`
          : runtimeDatabase.error || `Missing ${runtimeDatabase.missing?.join(', ') || 'database runtime env'}.`
        : 'Runtime database diagnostics have not loaded.',
    },
    {
      label: 'Disposable confirmation',
      ready: false,
      detail: 'Set BACKY_DATABASE_DISPOSABLE_CONFIRMED=true only for a disposable migrated Supabase/Postgres certification target.',
    },
    {
      label: 'Public API CORS',
      ready: Boolean(runtimePublicApi?.corsAllowedOriginsConfigured && runtimePublicApi.exposedContractHeaders.length),
      detail: runtimePublicApi
        ? `${runtimePublicApi.corsAllowedOriginCount} exact browser origin${runtimePublicApi.corsAllowedOriginCount === 1 ? '' : 's'} configured; ${runtimePublicApi.exposedContractHeaders.length} Backy contract headers exposed.`
        : 'Public API/CORS runtime diagnostics have not loaded.',
    },
  ];
  const frontendDatabaseReadyCount = frontendDatabaseCertificationChecks.filter((check) => check.ready).length;

  const updateFrontendDatabaseCommandOptions = (next: Partial<FrontendDatabaseCertificationCommandOptions>) => {
    setFrontendDatabaseCommandOptions((current) => ({
      ...current,
      ...next,
    }));
  };

  const copyEndpoint = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedEndpoint(url);
      setTimeout(() => {
        setCopiedEndpoint((current) => (current === url ? '' : current));
      }, 1200);
    } catch {
      setCopiedEndpoint('');
    }
  };

  const copyFrontendDatabaseCertificationEnvTemplate = async () => {
    if (frontendDatabaseCertificationControlsDisabled) return;

    try {
      await navigator.clipboard.writeText(frontendDatabaseCertificationEnvTemplate);
      setCopiedFrontendDatabaseEnvTemplate(true);
      setTimeout(() => {
        setCopiedFrontendDatabaseEnvTemplate(false);
      }, 1400);
    } catch {
      setCopiedFrontendDatabaseEnvTemplate(false);
    }
  };

  const copyFrontendDatabaseCertificationCommand = async () => {
    if (frontendDatabaseCertificationControlsDisabled) return;

    try {
      await navigator.clipboard.writeText(frontendDatabaseCertificationCommand);
      setCopiedFrontendDatabaseCommand(true);
      setTimeout(() => {
        setCopiedFrontendDatabaseCommand(false);
      }, 1400);
    } catch {
      setCopiedFrontendDatabaseCommand(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div id="managed">
        <h3 className="text-lg font-semibold mb-4">Delivery Mode</h3>
        <div className="grid gap-3">
          {DELIVERY_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border p-4 cursor-pointer transition-colors',
                value === option.id
                  ? 'bg-primary/5 border-primary'
                  : 'hover:bg-accent/40'
              )}
            >
              <input
                type="radio"
                name="delivery-mode"
                value={option.id}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
                className="mt-1"
              />
              <div>
                <p className="font-medium">{option.title}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">How this setting affects delivery</p>
            <p className="text-sm text-muted-foreground mt-1">
              {value === 'managed-hosting'
                ? `Pages are rendered and served by Backy at ${publicSiteBase}/[:site]/[path].`
                : 'Use API endpoints to run your own custom frontend stack.'}
            </p>
          </div>
          <a
            href={value === 'managed-hosting' ? '#managed' : '#api'}
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            {value === 'managed-hosting' ? 'Managed docs' : 'API docs'}
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      {runtimeStorage && (
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Media storage runtime</p>
              <p className="text-sm text-muted-foreground mt-1">
                Uploads are currently routed through the {runtimeStorage.provider} provider.
              </p>
            </div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                runtimeStorage.configured
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning'
              )}
            >
              {runtimeStorage.configured ? 'Configured' : 'Needs config'}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            {runtimeStorage.bucket && (
              <div>
                <dt className="text-xs text-muted-foreground">Bucket</dt>
                <dd className="font-mono text-xs">{runtimeStorage.bucket}</dd>
              </div>
            )}
            {runtimeStorage.region && (
              <div>
                <dt className="text-xs text-muted-foreground">Region</dt>
                <dd className="font-mono text-xs">{runtimeStorage.region}</dd>
              </div>
            )}
            {runtimeStorage.publicUrl && (
              <div>
                <dt className="text-xs text-muted-foreground">Public URL</dt>
                <dd className="font-mono text-xs break-all">{runtimeStorage.publicUrl}</dd>
              </div>
            )}
            {runtimeStorage.basePath && (
              <div>
                <dt className="text-xs text-muted-foreground">Local path</dt>
                <dd className="font-mono text-xs break-all">{runtimeStorage.basePath}</dd>
              </div>
            )}
          </dl>
          {runtimeStorage.missing.length > 0 && (
            <p className="mt-4 text-sm text-warning">
              Missing configuration: {runtimeStorage.missing.join(', ')}
            </p>
          )}
          {runtimeStorage.error && (
            <p className="mt-2 text-sm text-warning">{runtimeStorage.error}</p>
          )}
        </div>
      )}

      <div id="api" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-foreground" />
          <h3 className="text-lg font-semibold">API Access</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Your frontend can consume these contracts directly.
          Reference contract: <code>specs/backy-api-contracts.md</code>
        </p>

        <div className="rounded-xl border border-border bg-background p-4" data-testid="settings-frontend-database-certification">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Frontend SDK database certification</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Public manifest, OpenAPI, render payload, media, CMS, forms, comments, events, and SDK contracts stay Partial until this database-mode gate passes against a disposable migrated Supabase/Postgres target.
              </p>
            </div>
            <span className={cn(
              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
              frontendDatabaseReadyCount === frontendDatabaseCertificationChecks.length ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}
            >
              {frontendDatabaseReadyCount}/{frontendDatabaseCertificationChecks.length} ready
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={frontendDatabaseCertificationControlsDisabled}
              title={frontendDatabaseCertificationControlsTitle}
              onClick={onCopyFrontendDatabaseCertificationHandoff}
              iconStart={<Copy className="size-4" />}
              data-testid="settings-frontend-database-certification-copy-button"
            >
              Copy DB handoff
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={frontendDatabaseCertificationControlsDisabled}
              title={frontendDatabaseCertificationControlsTitle}
              onClick={onDownloadFrontendDatabaseCertificationHandoff}
              iconStart={<Download className="size-4" />}
              data-testid="settings-frontend-database-certification-download-button"
            >
              Download DB JSON
            </Button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {frontendDatabaseCertificationChecks.map((check) => (
              <div key={check.label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-foreground">{check.label}</div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', check.ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                    {check.ready ? 'Ready' : 'Needs input'}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Gate', value: 'npm run ci:sdk-postgres-smoke' },
              { label: 'Preflight', value: 'npm run test:sdk-postgres-preflight-contract' },
              { label: 'Workflow', value: '.github/workflows/sdk-postgres-smoke.yml' },
              { label: 'Required env', value: 'BACKY_DATABASE_URL or DATABASE_URL' },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                <div className="mt-1 break-words font-mono text-[11px] leading-4 text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
          <details className="mt-3 rounded-md border border-border bg-muted/10 p-3 text-xs" data-testid="settings-frontend-database-certification-details" data-default-collapsed="true">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
              <div>
                <div className="font-medium text-foreground">Database evidence and command builder</div>
                <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                  Expand when you need the scenario matrix, disposable database command, env template, and required input aliases.
                </p>
              </div>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                frontendDatabaseCertificationScenarioEvidence.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
              )}>
                {frontendDatabaseCertificationScenarioEvidence.coverage.covered}/{frontendDatabaseCertificationScenarioEvidence.coverage.total} scenarios
              </span>
            </summary>
          <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="settings-frontend-database-certification-evidence">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">Frontend database scenario evidence</div>
                <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                  Tracks the non-secret custom frontend service-data scenarios operators must prove before moving manifest, OpenAPI, and SDK contracts to database-certified.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  {frontendDatabaseCertificationScenarioEvidence.schemaVersion}
                </span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  frontendDatabaseCertificationScenarioEvidence.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}>
                  {frontendDatabaseCertificationScenarioEvidence.coverage.covered}/{frontendDatabaseCertificationScenarioEvidence.coverage.total} scenarios
                </span>
              </div>
            </div>
            <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground">
              {frontendDatabaseCertificationScenarioEvidence.requiredGate}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {frontendDatabaseCertificationScenarioEvidence.scenarios.map((scenario) => (
                <div key={scenario.key} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-foreground">{scenario.label}</div>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      scenario.status === 'covered' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                    )}>
                      {scenario.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {scenario.evidenceCount} evidence item{scenario.evidenceCount === 1 ? '' : 's'}
                  </div>
                  {scenario.status === 'missing' ? (
                    <div className="mt-1 text-[11px] text-foreground">{scenario.nextAction}</div>
                  ) : null}
                  <div className="mt-1 break-words text-[11px] text-muted-foreground">
                    Expected: {scenario.expectedEvidence.join(' | ')}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
              {frontendDatabaseCertificationScenarioEvidence.secretHandling}
            </div>
          </div>
          <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="settings-frontend-database-certification-command-builder">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">SDK Postgres command builder</div>
                <p className="mt-1 max-w-3xl text-muted-foreground">
                  Build the exact command for the custom-frontend SDK database smoke. Database URLs stay in CI secrets or local shell env; this builder only writes aliases and target guards.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyFrontendDatabaseCertificationEnvTemplate()}
                  disabled={frontendDatabaseCertificationControlsDisabled}
                  title={frontendDatabaseCertificationControlsTitle}
                  iconStart={copiedFrontendDatabaseEnvTemplate ? <Check className="size-4" /> : <Copy className="size-4" />}
                  data-testid="settings-frontend-database-certification-env-copy-button"
                >
                  {copiedFrontendDatabaseEnvTemplate ? 'Copied env template' : 'Copy env template'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyFrontendDatabaseCertificationCommand()}
                  disabled={frontendDatabaseCertificationControlsDisabled}
                  title={frontendDatabaseCertificationControlsTitle}
                  iconStart={copiedFrontendDatabaseCommand ? <Check className="size-4" /> : <Copy className="size-4" />}
                  data-testid="settings-frontend-database-certification-command-builder-copy-button"
                >
                  {copiedFrontendDatabaseCommand ? 'Copied command' : 'Copy guarded command'}
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs">
                <span className="font-semibold text-foreground">Database URL alias</span>
                <select
                  value={frontendDatabaseCommandOptions.databaseEnvAlias}
                  onChange={(event) => updateFrontendDatabaseCommandOptions({
                    databaseEnvAlias: event.target.value as FrontendDatabaseCertificationEnvAlias,
                  })}
                  disabled={frontendDatabaseCertificationControlsDisabled}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  data-testid="settings-frontend-database-certification-database-alias-select"
                >
                  {FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES.map((alias) => (
                    <option key={alias} value={alias}>{alias}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  Store the actual Postgres URL outside Backy.
                </span>
              </label>
              <label className="text-xs">
                <span className="font-semibold text-foreground">Expected host</span>
                <input
                  type="text"
                  value={frontendDatabaseCommandOptions.expectedHost}
                  onChange={(event) => updateFrontendDatabaseCommandOptions({ expectedHost: event.target.value })}
                  disabled={frontendDatabaseCertificationControlsDisabled}
                  placeholder="db.example.supabase.co"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  data-testid="settings-frontend-database-certification-expected-host-input"
                />
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  Optional guard for the target database host.
                </span>
              </label>
              <label className="text-xs">
                <span className="font-semibold text-foreground">Expected database</span>
                <input
                  type="text"
                  value={frontendDatabaseCommandOptions.expectedDatabase}
                  onChange={(event) => updateFrontendDatabaseCommandOptions({ expectedDatabase: event.target.value })}
                  disabled={frontendDatabaseCertificationControlsDisabled}
                  placeholder="postgres"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  data-testid="settings-frontend-database-certification-expected-database-input"
                />
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  Optional guard for the database name in the URL path.
                </span>
              </label>
              <div className="grid gap-2">
                <label className="flex min-h-[52px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <input
                    type="checkbox"
                    checked={frontendDatabaseCommandOptions.disposableConfirmed}
                    onChange={(event) => updateFrontendDatabaseCommandOptions({ disposableConfirmed: event.target.checked })}
                    disabled={frontendDatabaseCertificationControlsDisabled}
                    className="mt-1 size-4 rounded border-border"
                    data-testid="settings-frontend-database-certification-disposable-toggle"
                  />
                  <span>
                    <span className="block font-semibold text-foreground">Disposable confirmed</span>
                    <span className="mt-1 block font-mono text-[10px] text-muted-foreground">BACKY_DATABASE_DISPOSABLE_CONFIRMED=true</span>
                  </span>
                </label>
                <label className="flex min-h-[52px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <input
                    type="checkbox"
                    checked={frontendDatabaseCommandOptions.includeReleaseDoctor}
                    onChange={(event) => updateFrontendDatabaseCommandOptions({ includeReleaseDoctor: event.target.checked })}
                    disabled={frontendDatabaseCertificationControlsDisabled}
                    className="mt-1 size-4 rounded border-border"
                    data-testid="settings-frontend-database-certification-doctor-toggle"
                  />
                  <span>
                    <span className="block font-semibold text-foreground">Run release doctor first</span>
                    <span className="mt-1 block font-mono text-[10px] text-muted-foreground">npm run doctor:release-certification</span>
                  </span>
                </label>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="settings-frontend-database-certification-env-template">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Env template</div>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    Copy this into CI secrets or a local shell env file, then replace the database URL placeholder with a disposable migrated Supabase/Postgres target before running the guarded command.
                  </p>
                </div>
                <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                  backy.frontend-database-certification-env-template.v1
                </span>
              </div>
              <pre
                className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-5 text-foreground"
                data-testid="settings-frontend-database-certification-env-template-body"
              >
                {frontendDatabaseCertificationEnvTemplate}
              </pre>
            </div>
            <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-foreground p-3 text-[11px] leading-5 text-background" data-testid="settings-frontend-database-certification-command">
              <code>{frontendDatabaseCertificationCommand}</code>
            </pre>
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="settings-frontend-database-certification-required-inputs">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required inputs for this command</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {frontendDatabaseCertificationRequiredInputs.map((input) => (
                  <span key={input} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {input}
                  </span>
                ))}
              </div>
            </div>
          </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The public manifest exposes <span className="font-mono">backy.frontend-database-certification.v1</span> as <span className="font-mono">contract.databaseCertification</span>, and the SDK exposes <span className="font-mono">BackyFrontendDatabaseCertification</span>. Database URLs and service credentials stay in server/CI environment variables.
            </p>
          </details>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <EndpointBlock
            title="Public read + interaction"
            baseUrl={publicApiBase}
            endpoints={PUBLIC_API_ENDPOINTS}
            copiedEndpoint={copiedEndpoint}
            onCopy={copyEndpoint}
          />
          <EndpointBlock
            title="Admin write + management"
            baseUrl={adminApiBase}
            endpoints={ADMIN_API_ENDPOINTS}
            copiedEndpoint={copiedEndpoint}
            onCopy={copyEndpoint}
          />
        </div>
      </div>

      {value === 'custom-frontend' && (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm">
          <p className="font-medium">Getting started with custom frontend</p>
          <p className="text-muted-foreground mt-1">
            1) Fetch site context from <code>{`${publicApiBase}/sites/:identifier`}</code>.
            2) Load page payload from
            <code>{`${publicApiBase}/sites/:siteId/pages?path=/...`}</code>.
            3) Render using shared public contract keys only.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// INFRASTRUCTURE SETTINGS
// ============================================

type IntegrationSettings = NonNullable<SiteSettingsInput['integrations']>;
type AuthSettingsConfig = NonNullable<SiteSettingsInput['auth']>;
type AuthPolicySettingsConfig = Required<Omit<AuthSettingsConfig, 'apiKeyServiceKeys' | 'apiKeyRotationHistory' | 'apiKeyRevocationHistory'>>;
type GeneralSettingsConfig = NonNullable<IntegrationSettings['general']>;
type AppearanceSettingsConfig = NonNullable<IntegrationSettings['appearance']>;
type SeoSettingsConfig = NonNullable<IntegrationSettings['seo']>;
type SupabaseSettings = NonNullable<IntegrationSettings['supabase']>;
type StorageSettings = NonNullable<IntegrationSettings['storage']>;
type VercelSettings = NonNullable<IntegrationSettings['vercel']>;
type CommerceSettingsConfig = NonNullable<IntegrationSettings['commerce']>;
type NotificationSettingsConfig = NonNullable<IntegrationSettings['notifications']>;
type InfrastructureEnvProvider = 'database' | 'storage' | 'supabase' | 'mediaScanner' | 'vercel' | 'notifications' | 'commerce' | 'interactiveComponents' | 'publicApi';
type InfrastructureEnvContract = {
  provider: InfrastructureEnvProvider;
  key: string;
  label: string;
  description: string;
  configured: boolean;
  required: boolean;
  secret?: boolean;
  aliases?: string[];
  valueHint?: string;
  example: string;
};

const DEFAULT_GENERAL_SETTINGS: Required<GeneralSettingsConfig> = {
  siteName: 'My Website',
  siteDescription: 'A brief description of your website',
  timezone: 'UTC',
};

const DEFAULT_APPEARANCE_SETTINGS: Required<AppearanceSettingsConfig> = {
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
  backgroundColor: '#ffffff',
  surfaceColor: '#f8fafc',
  textColor: '#0f172a',
  mutedTextColor: '#64748b',
  fontFamily: 'inter',
  headingFontFamily: 'inter',
  bodyFontFamily: 'inter',
  monoFontFamily: 'jetbrains-mono',
  baseFontSize: 16,
  radius: 8,
  spacingUnit: 4,
  motionPreset: 'subtle',
};

const FONT_FAMILY_OPTIONS = [
  { value: 'inter', label: 'Inter' },
  { value: 'system', label: 'System UI' },
  { value: 'geist', label: 'Geist' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'opensans', label: 'Open Sans' },
  { value: 'lato', label: 'Lato' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'playfair', label: 'Playfair Display' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
] as const;

const MOTION_PRESETS = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'expressive', label: 'Expressive' },
] as const;

const DEFAULT_SEO_SETTINGS: Required<SeoSettingsConfig> = {
  titleTemplate: '%s | My Website',
  metaDescription: 'Welcome to my website',
  keywords: 'website, blog, cms',
  ogImageUrl: '',
  analyticsId: '',
};

const DEFAULT_COMMERCE_SETTINGS: Required<CommerceSettingsConfig> = {
  mode: 'catalog-only',
  currency: 'USD',
  paymentProvider: 'none',
  providerMode: 'test',
  providerAccountId: '',
  providerWebhookUrl: '',
  providerWebhookSecretId: '',
  providerWebhookEvents: 'checkout.session.completed,payment_intent.succeeded,invoice.payment_succeeded,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.trial_will_end,customer.subscription.deleted,charge.refunded',
  reconciliationMode: 'manual',
  reconciliationWindowHours: 24,
  checkoutSuccessPath: '/checkout/success',
  checkoutCancelPath: '/checkout/cancel',
  guestCheckout: true,
  taxEnabled: false,
  shippingEnabled: false,
  discountsEnabled: false,
  taxRatePercent: 8.25,
  digitalTaxRatePercent: 6,
  shippingBaseAmount: 8,
  shippingWeightRate: 1.25,
  discountPercent: 10,
  taxProvider: 'manual',
  taxProviderUrl: '',
  shippingProvider: 'manual',
  shippingProviderUrl: '',
  discountProvider: 'manual',
  discountProviderUrl: '',
  catalogSyncProvider: 'manual',
  catalogSyncProviderUrl: '',
  subscriptionActionProvider: 'manual',
  subscriptionActionProviderUrl: '',
  shippingLabelProvider: 'manual',
  shippingOriginAddress: '',
  shippingDefaultParcel: '',
  shippingDefaultCarrier: '',
  shippingDefaultServiceLevel: '',
  shippingDefaultRateId: '',
  fulfillmentProvider: 'manual',
  fulfillmentProviderUrl: '',
  inventoryReservations: true,
  reservationMinutes: 15,
  webhookEventsEnabled: false,
  billingPlan: 'free',
  monthlyOrderLimit: 100,
  productLimit: 100,
  siteLimit: 3,
  teamLimit: 3,
  seatLimit: 3,
  overageMode: 'warn',
  billingContactEmail: '',
};

const DEFAULT_AUTH_SETTINGS: AuthPolicySettingsConfig = {
  requireTwoFactor: false,
  inviteOnly: false,
  minPasswordLength: 12,
  sessionTimeoutMinutes: 120,
  allowedEmailDomains: '',
};

const colorInputValue = (value: string | undefined, fallback: string) => (
  /^#[0-9a-fA-F]{6}$/.test(value || '') ? value || fallback : fallback
);

const resolveAppearanceSettings = (value?: AppearanceSettingsConfig): Required<AppearanceSettingsConfig> => ({
  ...DEFAULT_APPEARANCE_SETTINGS,
  ...(value || {}),
});

const buildAppearanceThemeContract = (value?: AppearanceSettingsConfig) => {
  const resolved = resolveAppearanceSettings(value);

  return {
    schemaVersion: 'backy.theme.v1',
    colors: {
      primary: resolved.primaryColor,
      secondary: resolved.secondaryColor,
      background: resolved.backgroundColor,
      surface: resolved.surfaceColor,
      text: resolved.textColor,
      mutedText: resolved.mutedTextColor,
    },
    typography: {
      heading: resolved.headingFontFamily,
      body: resolved.bodyFontFamily || resolved.fontFamily,
      mono: resolved.monoFontFamily,
      baseFontSize: resolved.baseFontSize,
    },
    layout: {
      radius: resolved.radius,
      spacingUnit: resolved.spacingUnit,
    },
    motion: {
      preset: resolved.motionPreset,
    },
    cssVariables: {
      '--backy-color-primary': resolved.primaryColor,
      '--backy-color-secondary': resolved.secondaryColor,
      '--backy-color-background': resolved.backgroundColor,
      '--backy-color-surface': resolved.surfaceColor,
      '--backy-color-text': resolved.textColor,
      '--backy-color-muted-text': resolved.mutedTextColor,
      '--backy-font-heading': resolved.headingFontFamily,
      '--backy-font-body': resolved.bodyFontFamily || resolved.fontFamily,
      '--backy-font-mono': resolved.monoFontFamily,
      '--backy-font-size-base': `${resolved.baseFontSize}px`,
      '--backy-radius': `${resolved.radius}px`,
      '--backy-spacing-unit': `${resolved.spacingUnit}px`,
      '--backy-motion-preset': resolved.motionPreset,
    },
  };
};

const buildSettingsThemeDesignImpact = ({
  appearanceSettings,
  deliveryMode,
  publicApiBase,
  adminApiBase,
  validationIssues,
}: {
  appearanceSettings: AppearanceSettingsConfig;
  deliveryMode: DeliveryMode;
  publicApiBase: string;
  adminApiBase: string;
  validationIssues: SettingsValidationIssue[];
}) => {
  const themeContract = buildAppearanceThemeContract(appearanceSettings);
  const appearanceIssues = validationIssues.filter((issue) => issue.tab === 'appearance');
  const colorKeys = Object.keys(themeContract.colors);
  const typographyKeys = Object.keys(themeContract.typography);
  const cssVariableKeys = Object.keys(themeContract.cssVariables);

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 'backy.settings-theme-design-impact.v1',
    status: appearanceIssues.some((issue) => issue.severity === 'error') ? 'attention' : 'ready',
    deliveryMode,
    summary: 'Global Settings appearance tokens are the workspace-level source for custom frontend colors, typography, spacing, radius, and motion defaults.',
    themeContract,
    impact: {
      colorTokenCount: colorKeys.length,
      typographyTokenCount: typographyKeys.length,
      cssVariableCount: cssVariableKeys.length,
      invalidControlCount: appearanceIssues.length,
      invalidControls: appearanceIssues.map((issue) => ({
        label: issue.label,
        detail: issue.detail,
        severity: issue.severity,
      })),
    },
    editableControls: {
      colors: colorKeys.map((key) => ({
        key,
        cssVariable: `--backy-color-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`,
      })),
      typography: ['headingFontFamily', 'bodyFontFamily', 'monoFontFamily', 'baseFontSize'],
      layout: ['radius', 'spacingUnit'],
      motion: ['motionPreset'],
    },
    motion: {
      preset: themeContract.motion.preset,
      bindingPaths: [
        'content.themeTokenRefs.motion',
        'element.tokenRefs.animationDuration',
        'element.tokenRefs.animationEasing',
        'element.animation.tokenRefs.duration',
        'element.animation.tokenRefs.easing',
      ],
      animationStateFields: [
        'content.animations[]',
        'content.contentDocument.animations[]',
        'element.animation',
        'element.animation.trigger',
        'element.animation.from',
        'element.animation.to',
        'element.animation.scrollTrigger',
      ],
    },
    designStatePersistence: {
      tokenSchemaVersion: themeContract.schemaVersion,
      tokenRefPaths: [
        'content.themeTokenRefs',
        'content.contentDocument.themeTokenRefs',
        'element.tokenRefs',
        'element.styles',
        'element.props',
        'document.themeTokenRefs',
      ],
      editableSurfaces: [
        'pages',
        'blog',
        'reusable sections',
        'products',
        'collections',
        'live management overlay',
        'hosted public renderer',
      ],
      preservedDesignFields: [
        'content.elements',
        'content.contentDocument',
        'content.customCSS',
        'content.customJS',
        'content.assets',
        'content.animations',
        'content.interactions',
        'content.dataBindings',
        'content.editableMap',
        'content.themeTokenRefs',
      ],
    },
    frontendBindings: {
      publicManifestThemeModule: `${publicApiBase}/sites/{siteId}/manifest#data.modules.theme`,
      publicOpenApiThemeSchema: `${publicApiBase}/sites/{siteId}/openapi#/components/schemas/BackyThemeTokens`,
      adminSettingsApi: `${adminApiBase}/settings#data.settings.themeDesignImpact`,
      settingsHandoffPath: 'settingsHandoff.themeDesignImpact',
      cssVariableSelector: ':root, [data-backy-theme]',
    },
    privacy: {
      includesSecretValues: false,
      includesAdminApiKeys: false,
      includesProviderCredentials: false,
      includesPrivateContent: false,
      note: 'Theme design impact only exports non-secret design tokens, token reference paths, and editable design-state field names.',
    },
  };
};

const DEFAULT_NOTIFICATION_SETTINGS: Required<Pick<NotificationSettingsConfig, 'email' | 'inApp' | 'digestFrequency'>> & {
  webhookUrl: string;
} = {
  email: {
    newUser: false,
    pagePublished: false,
    formSubmission: false,
    orderCreated: false,
    productLowStock: false,
    comments: true,
    systemUpdates: false,
    recipient: '',
  },
  inApp: {
    comments: true,
    mentions: false,
    activity: true,
  },
  digestFrequency: 'instant',
  webhookUrl: '',
};

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const SIMPLE_DOMAIN_REGEX = /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;
const SUPABASE_PROJECT_REF_REGEX = /^[a-z0-9-]{6,63}$/;
const SECRET_ENV_REFERENCE_REGEX = /^(env:|\$)?[A-Z_][A-Z0-9_]*$/;
const SECRET_LIKE_VALUE_REGEXES = [
  /^BACKY_SECRET_TEST_VALUE_/i,
  /^(AKIA|ASIA)[A-Z0-9]{16}$/i,
  /^whsec_/i,
  /^stripe_whsec/i,
  /^sk_(live|test)_/i,
  /^rk_(live|test)_/i,
  /^gh[pousr]_/i,
  /^xox[baprs]-/i,
  /^-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/,
];

const isSecretEnvReference = (value: string): boolean => (
  SECRET_ENV_REFERENCE_REGEX.test(value.trim())
);

const looksLikeRawSecret = (value: string): boolean => (
  SECRET_LIKE_VALUE_REGEXES.some((pattern) => pattern.test(value.trim()))
);

const secretReferenceEnvKey = (value: string): string => (
  value.trim().replace(/^env:/i, '').replace(/^\$/, '')
);

const validateEnvReferenceIssue = (
  tab: SettingsTab,
  label: string,
  value: string | undefined,
  example: string,
  rawSecretLabel: string,
): SettingsValidationIssue | null => {
  const reference = value?.trim();
  if (!reference) {
    return null;
  }

  const rawSecret = looksLikeRawSecret(reference);
  if (!rawSecret && isSecretEnvReference(reference)) {
    return null;
  }

  return {
    tab,
    label: rawSecret
      ? `${label} looks like a raw secret`
      : `${label} must be an env reference`,
    detail: rawSecret
      ? `Move ${rawSecretLabel} into deployment environment variables and save only ${example} here.`
      : `Use ${example}, $${secretReferenceEnvKey(example)}, or ${secretReferenceEnvKey(example)} so Settings never stores the raw secret.`,
    severity: 'error',
  };
};

const isValidHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const addIssue = (
  issues: SettingsValidationIssue[],
  issue: SettingsValidationIssue,
) => {
  issues.push(issue);
};

function validateSettingsDraft({
  deliveryMode,
  generalSettings,
  appearanceSettings,
  seoSettings,
  commerceSettings,
  notificationSettings,
  authSettings,
  integrations,
}: {
  deliveryMode: DeliveryMode;
  generalSettings: GeneralSettingsConfig;
  appearanceSettings: AppearanceSettingsConfig;
  seoSettings: SeoSettingsConfig;
  commerceSettings: CommerceSettingsConfig;
  notificationSettings: NotificationSettingsConfig;
  authSettings?: SiteSettingsInput['auth'];
  integrations: IntegrationSettings;
}): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];
  const appearance = resolveAppearanceSettings(appearanceSettings);
  const policy: AuthPolicySettingsConfig = {
    ...DEFAULT_AUTH_SETTINGS,
    ...(authSettings || {}),
  };
  const storage = integrations.storage || {};
  const supabase = integrations.supabase || {};
  const vercel = integrations.vercel || {};
  const commerce = {
    ...DEFAULT_COMMERCE_SETTINGS,
    ...commerceSettings,
  };

  if (!generalSettings.siteName?.trim()) {
    addIssue(issues, {
      tab: 'general',
      label: 'Site name is required',
      detail: 'Backy needs a default site name for manifests, previews, emails, and frontend handoff.',
      severity: 'error',
    });
  }

  if (generalSettings.siteName && generalSettings.siteName.length > 80) {
    addIssue(issues, {
      tab: 'general',
      label: 'Site name is too long',
      detail: 'Keep the default site name under 80 characters so it fits navigation, previews, and SEO templates.',
      severity: 'warning',
    });
  }

  Object.entries({
    primaryColor: appearance.primaryColor,
    secondaryColor: appearance.secondaryColor,
    backgroundColor: appearance.backgroundColor,
    surfaceColor: appearance.surfaceColor,
    textColor: appearance.textColor,
    mutedTextColor: appearance.mutedTextColor,
  }).forEach(([key, value]) => {
    if (!HEX_COLOR_REGEX.test(value)) {
      addIssue(issues, {
        tab: 'appearance',
        label: `${key} must be a hex color`,
        detail: 'Use six-character hex colors like #0f172a so custom frontends can consume the theme contract safely.',
        severity: 'error',
      });
    }
  });

  if (appearance.baseFontSize < 12 || appearance.baseFontSize > 24) {
    addIssue(issues, {
      tab: 'appearance',
      label: 'Base font size is outside the supported range',
      detail: 'Use a base font size from 12 to 24 pixels.',
      severity: 'error',
    });
  }

  if (appearance.radius < 0 || appearance.radius > 32) {
    addIssue(issues, {
      tab: 'appearance',
      label: 'Corner radius is outside the supported range',
      detail: 'Use a corner radius from 0 to 32 pixels.',
      severity: 'error',
    });
  }

  if (appearance.spacingUnit < 2 || appearance.spacingUnit > 16) {
    addIssue(issues, {
      tab: 'appearance',
      label: 'Spacing unit is outside the supported range',
      detail: 'Use a spacing unit from 2 to 16 pixels.',
      severity: 'error',
    });
  }

  if (!seoSettings.titleTemplate?.includes('%s')) {
    addIssue(issues, {
      tab: 'seo',
      label: 'SEO title template needs %s',
      detail: 'Include %s where the page or post title should be inserted.',
      severity: 'warning',
    });
  }

  if (seoSettings.ogImageUrl && !isValidHttpUrl(seoSettings.ogImageUrl)) {
    addIssue(issues, {
      tab: 'seo',
      label: 'Default OG image must be a URL',
      detail: 'Use an http or https URL for social previews.',
      severity: 'error',
    });
  }

  if (storage.publicBaseUrl && !isValidHttpUrl(storage.publicBaseUrl)) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Storage public base URL is invalid',
      detail: 'Use the canonical http or https URL that serves public images, fonts, documents, and files.',
      severity: 'error',
    });
  }

  if ((storage.provider === 'supabase' || supabase.storageEnabled) && !storage.bucket && !supabase.projectRef) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Supabase storage needs a bucket or project ref',
      detail: 'Set a media bucket or Supabase project ref before using Supabase for file delivery.',
      severity: 'warning',
    });
  }

  if (storage.maxFileSizeMb !== undefined && (storage.maxFileSizeMb < 1 || storage.maxFileSizeMb > 2048)) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Max upload size is outside the supported range',
      detail: 'Use a maximum file size from 1 MB to 2048 MB.',
      severity: 'error',
    });
  }

  if (storage.workspaceStorageLimitGb !== undefined && (storage.workspaceStorageLimitGb < 1 || storage.workspaceStorageLimitGb > 102400)) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Workspace storage limit is outside the supported range',
      detail: 'Use a workspace storage limit from 1 GB to 102400 GB.',
      severity: 'error',
    });
  }

  if (storage.warningThresholdPercent !== undefined && (storage.warningThresholdPercent < 50 || storage.warningThresholdPercent > 100)) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Storage warning threshold is outside the supported range',
      detail: 'Use a warning threshold from 50% to 100%.',
      severity: 'error',
    });
  }

  [
    validateEnvReferenceIssue('infrastructure', 'Supabase storage key secret ref', storage.supabaseKeySecretRef, 'env:BACKY_SUPABASE_SERVICE_ROLE_KEY', 'the Supabase service role key'),
    validateEnvReferenceIssue('infrastructure', 'S3 access key secret ref', storage.accessKeyIdSecretRef, 'env:BACKY_S3_ACCESS_KEY_ID', 'the S3 access key'),
    validateEnvReferenceIssue('infrastructure', 'S3 secret access key ref', storage.secretAccessKeySecretRef, 'env:BACKY_S3_SECRET_ACCESS_KEY', 'the S3 secret access key'),
  ].forEach((issue) => {
    if (issue) {
      addIssue(issues, issue);
    }
  });

  if (supabase.projectUrl && !isValidHttpUrl(supabase.projectUrl)) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Supabase project URL is invalid',
      detail: 'Use the project URL from Supabase, for example https://project-ref.supabase.co.',
      severity: 'error',
    });
  }

  if (supabase.projectRef && !SUPABASE_PROJECT_REF_REGEX.test(supabase.projectRef)) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Supabase project ref has an invalid format',
      detail: 'Use lowercase letters, numbers, and hyphens only.',
      severity: 'error',
    });
  }

  if (deliveryMode === 'custom-frontend' && !integrations.vercel?.productionDomain && !integrations.storage?.publicBaseUrl) {
    addIssue(issues, {
      tab: 'delivery',
      label: 'Custom frontend mode needs a public handoff target',
      detail: 'Add a Vercel production domain or storage public base URL before relying on headless delivery.',
      severity: 'warning',
    });
  }

  if (vercel.productionDomain && (vercel.productionDomain.includes('://') || !SIMPLE_DOMAIN_REGEX.test(vercel.productionDomain))) {
    addIssue(issues, {
      tab: 'infrastructure',
      label: 'Vercel production domain should be a hostname',
      detail: 'Use a bare domain such as backy.example.com, without https:// or a path.',
      severity: 'error',
    });
  }

  if (!/^[A-Z]{3}$/.test(commerce.currency || '')) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Commerce currency must be an ISO code',
      detail: 'Use a three-letter uppercase currency code such as USD, EUR, GBP, or INR.',
      severity: 'error',
    });
  }

  if (commerce.mode === 'checkout-provider' && commerce.paymentProvider === 'none') {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Checkout provider is required',
      detail: 'Choose Stripe or manual payment handling before enabling provider checkout mode.',
      severity: 'warning',
    });
  }

  if (commerce.mode === 'checkout-provider' && commerce.paymentProvider === 'stripe' && !commerce.providerAccountId?.trim()) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Stripe account ID is missing',
      detail: 'Add the connected Stripe account or platform account reference before handing checkout to a frontend.',
      severity: 'warning',
    });
  }

  if (commerce.providerWebhookUrl && !isValidHttpUrl(commerce.providerWebhookUrl)) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Provider webhook URL is invalid',
      detail: 'Use the https endpoint that your payment provider will call after checkout, refund, and dispute events.',
      severity: 'error',
    });
  }

  if (commerce.webhookEventsEnabled && commerce.paymentProvider !== 'none' && !commerce.providerWebhookUrl?.trim()) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Provider webhook URL is required',
      detail: 'Enable webhook events only after adding the provider callback URL that Backy or your storefront will verify.',
      severity: 'warning',
    });
  }

  if (commerce.webhookEventsEnabled && commerce.paymentProvider !== 'none' && !commerce.providerWebhookSecretId?.trim()) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Webhook signing secret reference is missing',
      detail: 'Store only the secret identifier in Settings; the real signing secret should stay in provider environment variables.',
      severity: 'warning',
    });
  }

  const webhookSecretReference = commerce.providerWebhookSecretId?.trim();
  const webhookSecretIssue = validateEnvReferenceIssue('commerce', 'Webhook signing secret', webhookSecretReference, 'env:STRIPE_WEBHOOK_SECRET', 'the provider signing secret');
  if (webhookSecretIssue) {
    addIssue(issues, webhookSecretIssue);
  }

  ([
    {
      provider: commerce.taxProvider,
      url: commerce.taxProviderUrl,
      label: 'Tax provider endpoint URL',
      detail: 'Use an http or https tax calculator endpoint, or switch the tax provider back to built-in rules.',
    },
    {
      provider: commerce.shippingProvider,
      url: commerce.shippingProviderUrl,
      label: 'Shipping provider endpoint URL',
      detail: 'Use an http or https shipping calculator endpoint, or switch the shipping provider back to built-in rules.',
    },
    {
      provider: commerce.discountProvider,
      url: commerce.discountProviderUrl,
      label: 'Discount provider endpoint URL',
      detail: 'Use an http or https discount calculator endpoint, or switch the discount provider back to built-in rules.',
    },
    {
      provider: commerce.catalogSyncProvider,
      url: commerce.catalogSyncProviderUrl,
      label: 'Product catalog sync endpoint URL',
      detail: 'Use an http or https catalog-sync endpoint, or switch product provider sync back to manual/direct provider handoff.',
    },
    {
      provider: commerce.fulfillmentProvider,
      url: commerce.fulfillmentProviderUrl,
      label: 'Fulfillment endpoint URL',
      detail: 'Use an http or https warehouse/3PL endpoint, or switch fulfillment dispatch back to manual handoff.',
    },
  ] as const).forEach((endpoint) => {
    const value = endpoint.url?.trim() || '';
    if (endpoint.provider === 'http' && !value) {
      addIssue(issues, {
        tab: 'commerce',
        label: `${endpoint.label} is required`,
        detail: endpoint.detail,
        severity: 'warning',
      });
      return;
    }
    if (value && !isValidHttpUrl(value)) {
      addIssue(issues, {
        tab: 'commerce',
        label: `${endpoint.label} is invalid`,
        detail: endpoint.detail,
        severity: 'error',
      });
    }
  });

  if (commerce.reconciliationMode === 'webhook' && !commerce.webhookEventsEnabled) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Webhook reconciliation needs events enabled',
      detail: 'Turn on commerce webhook events before declaring provider settlement as webhook-driven.',
      severity: 'warning',
    });
  }

  if ((commerce.reconciliationWindowHours || 0) < 1 || (commerce.reconciliationWindowHours || 0) > 720) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Reconciliation window is invalid',
      detail: 'Use a provider reconciliation window from 1 to 720 hours.',
      severity: 'error',
    });
  }

  if (commerce.checkoutSuccessPath && !commerce.checkoutSuccessPath.startsWith('/')) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Success path must start with /',
      detail: 'Use an app-relative route such as /checkout/success so custom frontends can redirect consistently.',
      severity: 'error',
    });
  }

  if (commerce.checkoutCancelPath && !commerce.checkoutCancelPath.startsWith('/')) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Cancel path must start with /',
      detail: 'Use an app-relative route such as /checkout/cancel so custom frontends can redirect consistently.',
      severity: 'error',
    });
  }

  if ((commerce.reservationMinutes || 0) < 1 || (commerce.reservationMinutes || 0) > 1440) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Inventory reservation window is invalid',
      detail: 'Use a reservation window from 1 to 1440 minutes.',
      severity: 'error',
    });
  }

  if ((commerce.taxRatePercent || 0) < 0 || (commerce.taxRatePercent || 0) > 100) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Standard tax rate is invalid',
      detail: 'Use a standard tax rate from 0 to 100 percent.',
      severity: 'error',
    });
  }

  if ((commerce.digitalTaxRatePercent || 0) < 0 || (commerce.digitalTaxRatePercent || 0) > 100) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Digital tax rate is invalid',
      detail: 'Use a digital tax rate from 0 to 100 percent.',
      severity: 'error',
    });
  }

  if ((commerce.shippingBaseAmount || 0) < 0 || (commerce.shippingWeightRate || 0) < 0) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Shipping pricing is invalid',
      detail: 'Use non-negative shipping base and weight-rate amounts.',
      severity: 'error',
    });
  }

  if ((commerce.discountPercent || 0) < 0 || (commerce.discountPercent || 0) > 100) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Discount percent is invalid',
      detail: 'Use a discount percent from 0 to 100.',
      severity: 'error',
    });
  }

  if ((commerce.monthlyOrderLimit ?? 0) < 0 || (commerce.monthlyOrderLimit ?? 0) > 1000000) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Monthly order limit is invalid',
      detail: 'Use a monthly order limit from 0 to 1000000 orders.',
      severity: 'error',
    });
  }

  if ((commerce.productLimit ?? 0) < 0 || (commerce.productLimit ?? 0) > 1000000) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Product limit is invalid',
      detail: 'Use a product limit from 0 to 1000000 products.',
      severity: 'error',
    });
  }

  if ((commerce.siteLimit ?? 0) < 1 || (commerce.siteLimit ?? 0) > 10000) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Site limit is invalid',
      detail: 'Use a site limit from 1 to 10000 sites.',
      severity: 'error',
    });
  }

  if ((commerce.teamLimit ?? 0) < 1 || (commerce.teamLimit ?? 0) > 10000) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Team limit is invalid',
      detail: 'Use a team limit from 1 to 10000 teams.',
      severity: 'error',
    });
  }

  if ((commerce.seatLimit ?? 0) < 1 || (commerce.seatLimit ?? 0) > 10000) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Seat limit is invalid',
      detail: 'Use a seat limit from 1 to 10000 users.',
      severity: 'error',
    });
  }

  const billingContactEmail = commerce.billingContactEmail?.trim();
  if (billingContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingContactEmail)) {
    addIssue(issues, {
      tab: 'commerce',
      label: 'Billing contact email is invalid',
      detail: 'Use a valid email address for billing notices and overage review.',
      severity: 'error',
    });
  }

  if (notificationSettings.webhookUrl && !isValidHttpUrl(notificationSettings.webhookUrl)) {
    addIssue(issues, {
      tab: 'notifications',
      label: 'Webhook URL is invalid',
      detail: 'Use an http or https URL for workflow notifications.',
      severity: 'error',
    });
  }

  const notificationRecipient = notificationSettings.email?.recipient?.trim();
  if (notificationRecipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationRecipient)) {
    addIssue(issues, {
      tab: 'notifications',
      label: 'Notification recipient is invalid',
      detail: 'Use a valid email address for comment and workflow notification emails.',
      severity: 'error',
    });
  }

  if (policy.minPasswordLength < 8 || policy.minPasswordLength > 128) {
    addIssue(issues, {
      tab: 'security',
      label: 'Password length policy is invalid',
      detail: 'Use a minimum password length from 8 to 128 characters.',
      severity: 'error',
    });
  }

  if (policy.sessionTimeoutMinutes < 15 || policy.sessionTimeoutMinutes > 10080) {
    addIssue(issues, {
      tab: 'security',
      label: 'Session timeout is invalid',
      detail: 'Use a session timeout from 15 minutes to 7 days.',
      severity: 'error',
    });
  }

  if (policy.allowedEmailDomains) {
    const invalidDomains = policy.allowedEmailDomains
      .split(',')
      .map((domain) => domain.trim())
      .filter(Boolean)
      .filter((domain) => !SIMPLE_DOMAIN_REGEX.test(domain));

    if (invalidDomains.length > 0) {
      addIssue(issues, {
        tab: 'security',
        label: 'Allowed email domains include invalid values',
        detail: `Check ${invalidDomains.slice(0, 3).join(', ')}.`,
        severity: 'error',
      });
    }
  }

  return issues;
}

const inputClassName = cn(
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const configuredValue = (...values: Array<string | boolean | undefined | null>): boolean => (
  values.some((value) => (typeof value === 'boolean' ? value : Boolean(value)))
);

const buildSupabaseStoragePublicBaseUrl = (projectUrl?: string, bucket?: string): string => {
  const trimmedBucket = bucket?.trim();
  if (!projectUrl || !trimmedBucket) {
    return '';
  }

  try {
    const url = new URL(projectUrl);
    return `${url.origin}/storage/v1/object/public/${encodeURIComponent(trimmedBucket)}`;
  } catch {
    return '';
  }
};

const buildInfrastructureEnvContract = ({
  runtimeDatabase,
  runtimeStorage,
  runtimeSupabase,
  runtimeMediaScanner,
  runtimeVercel,
  runtimeNotifications,
  runtimeCommerce,
  runtimeInteractiveComponents,
  runtimePublicApi,
  storage,
  supabase,
  vercel,
  notifications,
  commerce,
}: {
  runtimeDatabase?: SiteSettingsInput['runtimeDatabase'];
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  runtimeSupabase?: SiteSettingsInput['runtimeSupabase'];
  runtimeMediaScanner?: SiteSettingsInput['runtimeMediaScanner'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  runtimeNotifications?: SiteSettingsInput['runtimeNotifications'];
  runtimeCommerce?: SiteSettingsInput['runtimeCommerce'];
  runtimeInteractiveComponents?: SiteSettingsInput['runtimeInteractiveComponents'];
  runtimePublicApi?: SiteSettingsInput['runtimePublicApi'];
  storage?: StorageSettings;
  supabase?: SupabaseSettings;
  vercel?: VercelSettings;
  notifications?: NotificationSettingsConfig;
  commerce?: CommerceSettingsConfig;
}): InfrastructureEnvContract[] => [
  {
    provider: 'database',
    key: 'BACKY_DATABASE_URL',
    aliases: ['DATABASE_URL'],
    label: 'Repository database',
    description: 'Postgres or hosted database URL used by Backy repositories outside demo/local mode.',
    configured: Boolean(runtimeDatabase?.mode === 'database' && runtimeDatabase.configured),
    required: true,
    secret: true,
    valueHint: runtimeDatabase?.host || runtimeDatabase?.path || runtimeDatabase?.database,
    example: 'postgres://user:password@host:5432/backy',
  },
  {
    provider: 'storage',
    key: 'BACKY_STORAGE_PROVIDER',
    aliases: ['BACKY_MEDIA_STORAGE_PROVIDER'],
    label: 'Media storage provider',
    description: 'Selects local, s3, or supabase storage for uploads, files, fonts, and public assets.',
    configured: configuredValue(runtimeStorage?.provider, storage?.provider),
    required: true,
    valueHint: runtimeStorage?.provider || storage?.provider,
    example: 'supabase',
  },
  {
    provider: 'storage',
    key: 'BACKY_STORAGE_PUBLIC_BASE_URL',
    aliases: ['BACKY_MEDIA_PUBLIC_BASE_URL'],
    label: 'Public file base URL',
    description: 'Canonical public URL prefix used for hosted images, fonts, documents, and downloadable files.',
    configured: configuredValue(runtimeStorage?.publicUrl, storage?.publicBaseUrl),
    required: Boolean(storage?.provider && storage.provider !== 'local'),
    valueHint: runtimeStorage?.publicUrl || storage?.publicBaseUrl,
    example: 'https://project-ref.supabase.co/storage/v1/object/public/media',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_URL',
    aliases: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
    label: 'Supabase project URL',
    description: 'Project URL for Supabase-backed database, storage, and future auth adapter work.',
    configured: configuredValue(runtimeSupabase?.projectUrl, supabase?.projectUrl),
    required: Boolean(supabase?.databaseEnabled || supabase?.storageEnabled || supabase?.authEnabled),
    valueHint: runtimeSupabase?.projectUrl || supabase?.projectUrl,
    example: 'https://project-ref.supabase.co',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_ANON_KEY',
    aliases: ['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    label: 'Supabase anon key',
    description: 'Public Supabase key for read/client-safe Supabase workflows when enabled.',
    configured: Boolean(runtimeSupabase?.anonKeyConfigured),
    required: Boolean(supabase?.authEnabled),
    secret: true,
    example: '<supabase-anon-key>',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_SERVICE_ROLE_KEY',
    aliases: ['SUPABASE_SERVICE_ROLE_KEY'],
    label: 'Supabase service role key',
    description: 'Server-only Supabase key for Backy storage and privileged database operations.',
    configured: Boolean(runtimeSupabase?.serviceRoleConfigured),
    required: Boolean(supabase?.databaseEnabled || supabase?.storageEnabled),
    secret: true,
    example: '<supabase-service-role-key>',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_STORAGE_BUCKET',
    aliases: ['BACKY_STORAGE_BUCKET'],
    label: 'Supabase storage bucket',
    description: 'Bucket used by media uploads when Supabase storage is selected.',
    configured: configuredValue(runtimeSupabase?.storageBucket, runtimeStorage?.provider === 'supabase' && runtimeStorage.bucket, storage?.provider === 'supabase' && storage.bucket),
    required: Boolean(supabase?.storageEnabled || runtimeStorage?.provider === 'supabase' || storage?.provider === 'supabase'),
    valueHint: runtimeSupabase?.storageBucket || (runtimeStorage?.provider === 'supabase' ? runtimeStorage.bucket : undefined) || (storage?.provider === 'supabase' ? storage.bucket : undefined),
    example: 'media',
  },
  {
    provider: 'mediaScanner',
    key: 'BACKY_MEDIA_SCAN_PROVIDER',
    aliases: ['BACKY_MEDIA_SCANNER_PROVIDER'],
    label: 'Media scanner provider',
    description: 'Enables upload safety scanning with http, clamav, or none before files enter central media storage.',
    configured: Boolean(runtimeMediaScanner?.enabled),
    required: false,
    valueHint: runtimeMediaScanner?.provider,
    example: 'http',
  },
  {
    provider: 'mediaScanner',
    key: 'BACKY_MEDIA_SCAN_ENDPOINT',
    aliases: ['BACKY_MEDIA_SCANNER_ENDPOINT'],
    label: 'Media scanner endpoint',
    description: 'HTTP scanner endpoint used when media scanning is enabled for uploads and replacements.',
    configured: Boolean(runtimeMediaScanner?.endpointConfigured || runtimeMediaScanner?.host),
    required: Boolean(runtimeMediaScanner?.enabled),
    valueHint: runtimeMediaScanner?.host ? `${runtimeMediaScanner.host}${runtimeMediaScanner.port ? `:${runtimeMediaScanner.port}` : ''}` : undefined,
    example: 'https://scanner.example.com/scan',
  },
  {
    provider: 'mediaScanner',
    key: 'BACKY_MEDIA_SCAN_API_KEY',
    aliases: ['BACKY_MEDIA_SCANNER_API_KEY'],
    label: 'Media scanner API key',
    description: 'Optional bearer token sent only from Backy server routes to the configured media scanner.',
    configured: Boolean(runtimeMediaScanner?.apiKeyConfigured),
    required: false,
    secret: true,
    example: '<scanner-api-key>',
  },
  {
    provider: 'vercel',
    key: 'VERCEL_PROJECT_ID',
    aliases: ['BACKY_VERCEL_PROJECT_ID'],
    label: 'Vercel project',
    description: 'Project identifier for hosted Backy and future deploy orchestration.',
    configured: configuredValue(runtimeVercel?.projectId, vercel?.projectId),
    required: Boolean(vercel?.autoDeploy || vercel?.previewDeployments),
    valueHint: runtimeVercel?.projectId || vercel?.projectId,
    example: 'prj_xxxxxxxxxxxxxxxxxxxx',
  },
  {
    provider: 'notifications',
    key: 'BACKY_EMAIL_PROVIDER',
    aliases: ['BACKY_TRANSACTIONAL_EMAIL_PROVIDER'],
    label: 'Notification email provider',
    description: 'Selects production email delivery for form, comment, invite, reset, and workflow notifications.',
    configured: Boolean(runtimeNotifications?.productionReady),
    required: Boolean(
      notifications?.email?.recipient ||
        notifications?.email?.comments ||
        notifications?.email?.newUser ||
        notifications?.email?.pagePublished ||
        notifications?.email?.formSubmission ||
        notifications?.email?.orderCreated ||
        notifications?.email?.productLowStock ||
        notifications?.email?.systemUpdates
    ),
    valueHint: runtimeNotifications?.emailProvider,
    example: 'resend',
  },
  {
    provider: 'notifications',
    key: 'BACKY_EMAIL_FROM',
    aliases: ['BACKY_NOTIFICATION_EMAIL_FROM', 'BACKY_SMTP_FROM', 'BACKY_RESEND_FROM'],
    label: 'Notification sender',
    description: 'Sender identity used by Backy notification emails.',
    configured: Boolean(runtimeNotifications?.from),
    required: Boolean(
      notifications?.email?.recipient ||
        notifications?.email?.comments ||
        notifications?.email?.newUser ||
        notifications?.email?.pagePublished ||
        notifications?.email?.formSubmission ||
        notifications?.email?.orderCreated ||
        notifications?.email?.productLowStock ||
        notifications?.email?.systemUpdates
    ),
    valueHint: runtimeNotifications?.from,
    example: 'Backy <notifications@example.com>',
  },
  {
    provider: 'notifications',
    key: 'BACKY_RESEND_API_KEY',
    aliases: ['RESEND_API_KEY'],
    label: 'Resend API key',
    description: 'Server-only API key used when Resend is selected for notification delivery.',
    configured: Boolean(runtimeNotifications?.apiKeyConfigured),
    required: runtimeNotifications?.emailProvider === 'resend',
    secret: true,
    example: '<resend-api-key>',
  },
  {
    provider: 'notifications',
    key: 'BACKY_SMTP_HOST',
    aliases: ['SMTP_HOST'],
    label: 'SMTP host',
    description: 'SMTP host used when SMTP notification delivery is selected.',
    configured: Boolean(runtimeNotifications?.smtpHostConfigured),
    required: runtimeNotifications?.emailProvider === 'smtp',
    valueHint: runtimeNotifications?.smtpHostConfigured ? 'configured' : undefined,
    example: 'smtp.example.com',
  },
  {
    provider: 'notifications',
    key: 'BACKY_SMTP_USER',
    aliases: ['SMTP_USER'],
    label: 'SMTP username',
    description: 'Optional SMTP auth username used with the matching SMTP password when SMTP delivery requires authentication.',
    configured: Boolean(runtimeNotifications?.smtpAuthConfigured),
    required: false,
    secret: true,
    example: '<smtp-username>',
  },
  {
    provider: 'notifications',
    key: 'BACKY_SMTP_PASSWORD',
    aliases: ['SMTP_PASSWORD'],
    label: 'SMTP password',
    description: 'Optional SMTP auth password used with the matching SMTP username when SMTP delivery requires authentication.',
    configured: Boolean(runtimeNotifications?.smtpAuthConfigured),
    required: false,
    secret: true,
    example: '<smtp-password>',
  },
  {
    provider: 'notifications',
    key: 'BACKY_EMAIL_DELIVERY_ENDPOINT',
    aliases: ['BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL'],
    label: 'HTTP delivery endpoint',
    description: 'Server-only endpoint used when HTTP endpoint notification delivery is selected.',
    configured: Boolean(runtimeNotifications?.endpointConfigured),
    required: runtimeNotifications?.emailProvider === 'http-endpoint',
    secret: true,
    example: 'https://notifications.example.com/backy',
  },
  {
    provider: 'commerce',
    key: runtimeCommerce?.webhookSecretEnvKeys?.[0] || 'BACKY_COMMERCE_WEBHOOK_SECRET_<REFERENCE>',
    aliases: runtimeCommerce?.webhookSecretEnvKeys?.slice(1),
    label: 'Commerce webhook signing secret',
    description: 'Server-only provider signing secret used to verify checkout, payment, refund, and dispute webhooks.',
    configured: Boolean(runtimeCommerce?.webhookSecretConfigured),
    required: Boolean(commerce?.webhookEventsEnabled && commerce.paymentProvider !== 'none'),
    secret: true,
    valueHint: runtimeCommerce?.webhookSecretReference,
    example: '<provider-webhook-secret>',
  },
  {
    provider: 'commerce',
    key: 'STRIPE_SECRET_KEY',
    aliases: ['BACKY_STRIPE_SECRET_KEY'],
    label: 'Payment provider API key',
    description: 'Server-only Stripe key used by checkout sessions, Stripe Tax calculations, promotion-code discounts, and provider refund execution.',
    configured: Boolean(runtimeCommerce?.stripeSecretConfigured),
    required: commerce?.paymentProvider === 'stripe' || commerce?.taxProvider === 'stripe' || commerce?.discountProvider === 'stripe',
    secret: true,
    example: '<stripe-secret-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_STRIPE_API_BASE_URL',
    aliases: ['STRIPE_API_BASE_URL'],
    label: 'Stripe API base URL',
    description: 'Optional Stripe API base URL override for smoke tests, sandbox adapters, and private network routing.',
    configured: Boolean(runtimeCommerce?.stripeApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.stripeApiBaseUrl,
    example: 'https://api.stripe.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_STRIPE_API_VERSION',
    aliases: ['STRIPE_API_VERSION'],
    label: 'Stripe API version',
    description: 'Optional Stripe API version override sent with Stripe Tax and promotion-code quote requests.',
    configured: Boolean(runtimeCommerce?.stripeApiVersion),
    required: false,
    valueHint: runtimeCommerce?.stripeApiVersion,
    example: '2025-10-29.clover',
  },
  {
    provider: 'commerce',
    key: 'BACKY_STRIPE_TAX_API_BASE_URL',
    label: 'Stripe Tax API base URL',
    description: 'Optional Stripe Tax base URL override used by Orders quote refresh when Stripe Tax is selected.',
    configured: Boolean(runtimeCommerce?.stripeTaxApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.stripeTaxApiBaseUrl,
    example: 'https://api.stripe.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_STRIPE_DISCOUNT_API_BASE_URL',
    label: 'Stripe discount API base URL',
    description: 'Optional Stripe promotion-code base URL override used by Orders quote refresh when Stripe discounts are selected.',
    configured: Boolean(runtimeCommerce?.stripeDiscountApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.stripeDiscountApiBaseUrl,
    example: 'https://api.stripe.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_TAXJAR_API_KEY',
    aliases: ['TAXJAR_API_KEY'],
    label: 'TaxJar API key',
    description: 'Server-only TaxJar key used by Orders quote refresh when TaxJar is selected.',
    configured: Boolean(runtimeCommerce?.taxJarApiKeyConfigured),
    required: commerce?.taxProvider === 'taxjar',
    secret: true,
    example: '<taxjar-api-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_TAXJAR_API_BASE_URL',
    aliases: ['TAXJAR_API_BASE_URL'],
    label: 'TaxJar API base URL',
    description: 'Optional TaxJar API base URL override used by Orders quote refresh.',
    configured: Boolean(runtimeCommerce?.taxJarApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.taxJarApiBaseUrl,
    example: 'https://api.taxjar.com/v2',
  },
  {
    provider: 'commerce',
    key: 'BACKY_AVALARA_ACCOUNT_ID',
    aliases: ['AVALARA_ACCOUNT_ID'],
    label: 'Avalara account ID',
    description: 'Server-only Avalara account id used by Orders quote refresh when Avalara is selected.',
    configured: Boolean(runtimeCommerce?.avalaraAccountConfigured),
    required: commerce?.taxProvider === 'avalara',
    secret: true,
    example: '<avalara-account-id>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_AVALARA_LICENSE_KEY',
    aliases: ['AVALARA_LICENSE_KEY'],
    label: 'Avalara license key',
    description: 'Server-only Avalara license key used by Orders quote refresh when Avalara is selected.',
    configured: Boolean(runtimeCommerce?.avalaraLicenseKeyConfigured),
    required: commerce?.taxProvider === 'avalara',
    secret: true,
    example: '<avalara-license-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_AVALARA_COMPANY_CODE',
    aliases: ['AVALARA_COMPANY_CODE'],
    label: 'Avalara company code',
    description: 'Server-only Avalara company code used by Orders quote refresh when Avalara is selected.',
    configured: Boolean(runtimeCommerce?.avalaraCompanyCodeConfigured),
    required: commerce?.taxProvider === 'avalara',
    secret: true,
    example: '<avalara-company-code>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_AVALARA_API_BASE_URL',
    aliases: ['AVALARA_API_BASE_URL'],
    label: 'Avalara API base URL',
    description: 'Optional Avalara AvaTax base URL override used by Orders quote refresh.',
    configured: Boolean(runtimeCommerce?.avalaraApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.avalaraApiBaseUrl,
    example: 'https://sandbox-rest.avatax.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_STRIPE_REFUND_API_BASE_URL',
    label: 'Stripe Refund API base URL',
    description: 'Optional Stripe refund base URL override used by Orders provider-refund execution.',
    configured: Boolean(runtimeCommerce?.stripeRefundApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.stripeRefundApiBaseUrl,
    example: 'https://api.stripe.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_PAYPAL_ACCESS_TOKEN',
    aliases: ['PAYPAL_ACCESS_TOKEN'],
    label: 'PayPal commerce access token',
    description: 'Server-only PayPal access token used by Orders provider-refund execution and Products subscription lifecycle actions.',
    configured: Boolean(runtimeCommerce?.paypalAccessTokenConfigured),
    required: false,
    secret: true,
    example: '<paypal-access-token>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_PAYPAL_API_BASE_URL',
    aliases: ['PAYPAL_API_BASE_URL'],
    label: 'PayPal API base URL',
    description: 'Optional PayPal API base URL override for sandbox adapters, smoke tests, and private network routing.',
    configured: Boolean(runtimeCommerce?.paypalApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.paypalApiBaseUrl,
    example: 'https://api-m.paypal.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_PADDLE_API_KEY',
    aliases: ['PADDLE_API_KEY'],
    label: 'Paddle API key',
    description: 'Server-only Paddle API key used by Orders provider-refund execution and Products subscription lifecycle actions.',
    configured: Boolean(runtimeCommerce?.paddleApiKeyConfigured),
    required: false,
    secret: true,
    example: '<paddle-api-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_PADDLE_API_BASE_URL',
    aliases: ['PADDLE_API_BASE_URL'],
    label: 'Paddle API base URL',
    description: 'Optional Paddle API base URL override for sandbox adapters, smoke tests, and private network routing.',
    configured: Boolean(runtimeCommerce?.paddleApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.paddleApiBaseUrl,
    example: 'https://api.paddle.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_SQUARE_ACCESS_TOKEN',
    aliases: ['SQUARE_ACCESS_TOKEN'],
    label: 'Square commerce access token',
    description: 'Server-only Square access token used by Products catalog sync, Products subscription lifecycle actions, and Orders provider-refund execution.',
    configured: Boolean(runtimeCommerce?.squareAccessTokenConfigured),
    required: false,
    secret: true,
    example: '<square-access-token>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_SQUARE_API_BASE_URL',
    aliases: ['SQUARE_API_BASE_URL'],
    label: 'Square API base URL',
    description: 'Optional Square API base URL override for sandbox adapters, smoke tests, and private network routing.',
    configured: Boolean(runtimeCommerce?.squareApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.squareApiBaseUrl,
    example: 'https://connect.squareup.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN',
    aliases: ['SHOPIFY_ADMIN_ACCESS_TOKEN'],
    label: 'Shopify catalog access token',
    description: 'Server-only Shopify Admin token used by Products catalog sync to create products, variants, and Backy metafields.',
    configured: Boolean(runtimeCommerce?.shopifyAdminAccessTokenConfigured),
    required: false,
    secret: true,
    example: '<shopify-admin-access-token>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_SHOPIFY_STORE_DOMAIN',
    aliases: ['SHOPIFY_STORE_DOMAIN'],
    label: 'Shopify store domain',
    description: 'Shopify store domain used to resolve the Admin API base URL when no explicit base URL override is configured.',
    configured: Boolean(runtimeCommerce?.shopifyStoreConfigured),
    required: false,
    valueHint: runtimeCommerce?.shopifyStoreDomain || runtimeCommerce?.shopifyAdminApiBaseUrl,
    example: 'store.myshopify.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_BIGCOMMERCE_ACCESS_TOKEN',
    aliases: ['BIGCOMMERCE_ACCESS_TOKEN'],
    label: 'BigCommerce catalog access token',
    description: 'Server-only BigCommerce token used by Products catalog sync to create catalog products, variants, and custom fields.',
    configured: Boolean(runtimeCommerce?.bigCommerceAccessTokenConfigured),
    required: false,
    secret: true,
    example: '<bigcommerce-access-token>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_BIGCOMMERCE_STORE_HASH',
    aliases: ['BIGCOMMERCE_STORE_HASH'],
    label: 'BigCommerce store hash',
    description: 'BigCommerce store hash used to resolve the Catalog API base URL when no explicit base URL override is configured.',
    configured: Boolean(runtimeCommerce?.bigCommerceStoreConfigured),
    required: false,
    valueHint: runtimeCommerce?.bigCommerceStoreHash || runtimeCommerce?.bigCommerceApiBaseUrl,
    example: 'abc123',
  },
  {
    provider: 'commerce',
    key: 'BACKY_WOOCOMMERCE_CONSUMER_KEY',
    aliases: ['WOOCOMMERCE_CONSUMER_KEY'],
    label: 'WooCommerce consumer key',
    description: 'Server-only WooCommerce consumer key used by Products catalog sync.',
    configured: Boolean(runtimeCommerce?.wooCommerceConsumerKeyConfigured),
    required: false,
    secret: true,
    example: '<woocommerce-consumer-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_WOOCOMMERCE_CONSUMER_SECRET',
    aliases: ['WOOCOMMERCE_CONSUMER_SECRET'],
    label: 'WooCommerce consumer secret',
    description: 'Server-only WooCommerce consumer secret used by Products catalog sync.',
    configured: Boolean(runtimeCommerce?.wooCommerceConsumerSecretConfigured),
    required: false,
    secret: true,
    example: '<woocommerce-consumer-secret>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_WOOCOMMERCE_STORE_URL',
    aliases: ['WOOCOMMERCE_STORE_URL'],
    label: 'WooCommerce store URL',
    description: 'WooCommerce store URL used to resolve the REST API base URL when no explicit base URL override is configured.',
    configured: Boolean(runtimeCommerce?.wooCommerceStoreConfigured),
    required: false,
    valueHint: runtimeCommerce?.wooCommerceStoreUrl || runtimeCommerce?.wooCommerceApiBaseUrl,
    example: 'https://store.example.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ETSY_ACCESS_TOKEN',
    aliases: ['ETSY_ACCESS_TOKEN'],
    label: 'Etsy access token',
    description: 'Server-only Etsy OAuth token used by Products catalog sync to create draft listings.',
    configured: Boolean(runtimeCommerce?.etsyAccessTokenConfigured),
    required: false,
    secret: true,
    example: '<etsy-access-token>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ETSY_API_KEY',
    aliases: ['ETSY_API_KEY'],
    label: 'Etsy API key',
    description: 'Server-only Etsy application API key sent with draft-listing catalog sync requests.',
    configured: Boolean(runtimeCommerce?.etsyApiKeyConfigured),
    required: false,
    secret: true,
    example: '<etsy-api-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ETSY_SHOP_ID',
    aliases: ['ETSY_SHOP_ID'],
    label: 'Etsy shop id',
    description: 'Etsy shop id used to resolve the draft-listing endpoint for Products catalog sync.',
    configured: Boolean(runtimeCommerce?.etsyShopConfigured),
    required: false,
    valueHint: runtimeCommerce?.etsyShopId || runtimeCommerce?.etsyApiBaseUrl,
    example: '12345678',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ETSY_API_BASE_URL',
    aliases: ['ETSY_API_BASE_URL'],
    label: 'Etsy API base URL',
    description: 'Optional Etsy API base URL override for smoke tests, sandbox adapters, and private network routing.',
    configured: Boolean(runtimeCommerce?.etsyApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.etsyApiBaseUrl,
    example: 'https://api.etsy.com/v3/application',
  },
  {
    provider: 'commerce',
    key: 'BACKY_MAGENTO_ACCESS_TOKEN',
    aliases: ['MAGENTO_ACCESS_TOKEN'],
    label: 'Magento catalog access token',
    description: 'Server-only Magento/Adobe Commerce bearer token used by Products catalog sync to create catalog products.',
    configured: Boolean(runtimeCommerce?.magentoAccessTokenConfigured),
    required: false,
    secret: true,
    example: '<magento-access-token>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_MAGENTO_STORE_URL',
    aliases: ['MAGENTO_STORE_URL'],
    label: 'Magento store URL',
    description: 'Magento/Adobe Commerce store URL used to resolve the REST catalog API when no explicit base URL override is configured.',
    configured: Boolean(runtimeCommerce?.magentoStoreConfigured),
    required: false,
    valueHint: runtimeCommerce?.magentoStoreUrl || runtimeCommerce?.magentoApiBaseUrl,
    example: 'https://store.example.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_MAGENTO_API_BASE_URL',
    aliases: ['MAGENTO_API_BASE_URL'],
    label: 'Magento API base URL',
    description: 'Optional Magento/Adobe Commerce REST API base URL override for smoke tests, sandbox adapters, and private network routing.',
    configured: Boolean(runtimeCommerce?.magentoApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.magentoApiBaseUrl,
    example: 'https://store.example.com/rest/default/V1',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ADYEN_API_KEY',
    aliases: ['ADYEN_API_KEY'],
    label: 'Adyen refund API key',
    description: 'Server-only Adyen API key used by Orders provider-refund execution for payment refunds.',
    configured: Boolean(runtimeCommerce?.adyenApiKeyConfigured),
    required: false,
    secret: true,
    example: '<adyen-api-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ADYEN_MERCHANT_ACCOUNT',
    aliases: ['ADYEN_MERCHANT_ACCOUNT'],
    label: 'Adyen merchant account',
    description: 'Server-side merchant account identifier required for Adyen refund execution.',
    configured: Boolean(runtimeCommerce?.adyenMerchantAccountConfigured),
    required: false,
    secret: true,
    example: '<adyen-merchant-account>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ADYEN_API_BASE_URL',
    aliases: ['ADYEN_API_BASE_URL'],
    label: 'Adyen API base URL',
    description: 'Optional Adyen Checkout API base URL override used by Orders provider-refund execution, sandbox adapters, smoke tests, and private network routing.',
    configured: Boolean(runtimeCommerce?.adyenApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.adyenApiBaseUrl,
    example: 'https://checkout-test.adyen.com/v71',
  },
  {
    provider: 'commerce',
    key: 'BACKY_ADYEN_RECURRING_API_BASE_URL',
    aliases: ['ADYEN_RECURRING_API_BASE_URL'],
    label: 'Adyen Recurring API base URL',
    description: 'Optional Adyen PAL Recurring API base URL override used by Products subscription cancellation actions.',
    configured: Boolean(runtimeCommerce?.adyenRecurringApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.adyenRecurringApiBaseUrl,
    example: 'https://pal-test.adyen.com/pal/servlet/Recurring/v68',
  },
  {
    provider: 'commerce',
    key: 'BACKY_MOLLIE_API_KEY',
    aliases: ['MOLLIE_API_KEY'],
    label: 'Mollie refund API key',
    description: 'Server-only Mollie API key used by Orders provider-refund execution for payment refunds.',
    configured: Boolean(runtimeCommerce?.mollieApiKeyConfigured),
    required: false,
    secret: true,
    example: '<mollie-api-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_MOLLIE_API_BASE_URL',
    aliases: ['MOLLIE_API_BASE_URL'],
    label: 'Mollie API base URL',
    description: 'Optional Mollie API base URL override for sandbox adapters, smoke tests, and private network routing.',
    configured: Boolean(runtimeCommerce?.mollieApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.mollieApiBaseUrl,
    example: 'https://api.mollie.com/v2',
  },
  {
    provider: 'commerce',
    key: 'BACKY_RAZORPAY_KEY_ID',
    aliases: ['RAZORPAY_KEY_ID'],
    label: 'Razorpay key ID',
    description: 'Server-only Razorpay key ID used with the key secret for Orders provider-refund execution and Products subscription lifecycle actions.',
    configured: Boolean(runtimeCommerce?.razorpayKeyIdConfigured),
    required: false,
    secret: true,
    example: '<razorpay-key-id>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_RAZORPAY_KEY_SECRET',
    aliases: ['RAZORPAY_KEY_SECRET'],
    label: 'Razorpay key secret',
    description: 'Server-only Razorpay key secret used by Orders provider-refund execution and Products subscription lifecycle actions.',
    configured: Boolean(runtimeCommerce?.razorpayKeySecretConfigured),
    required: false,
    secret: true,
    example: '<razorpay-key-secret>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_RAZORPAY_API_BASE_URL',
    aliases: ['RAZORPAY_API_BASE_URL'],
    label: 'Razorpay API base URL',
    description: 'Optional Razorpay API base URL override for sandbox adapters, smoke tests, and private network routing.',
    configured: Boolean(runtimeCommerce?.razorpayApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.razorpayApiBaseUrl,
    example: 'https://api.razorpay.com',
  },
  {
    provider: 'commerce',
    key: 'BACKY_EASYPOST_API_KEY',
    aliases: ['EASYPOST_API_KEY'],
    label: 'EasyPost label API key',
    description: 'Server-only EasyPost key used by Orders to calculate shipping quotes, purchase labels, void shipments, and refresh tracking.',
    configured: Boolean(runtimeCommerce?.easyPostApiKeyConfigured),
    required: commerce?.shippingLabelProvider === 'easypost' || commerce?.shippingProvider === 'easypost',
    secret: true,
    example: '<easypost-api-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_EASYPOST_API_BASE_URL',
    aliases: ['EASYPOST_API_BASE_URL'],
    label: 'EasyPost API base URL',
    description: 'Optional EasyPost API base URL override for smoke tests, sandbox adapters, and private network routing.',
    configured: Boolean(runtimeCommerce?.easyPostApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.easyPostApiBaseUrl,
    example: 'https://api.easypost.com/v2',
  },
  {
    provider: 'commerce',
    key: 'BACKY_SHIPPO_API_KEY',
    aliases: ['SHIPPO_API_KEY'],
    label: 'Shippo label API key',
    description: 'Server-only Shippo key used by Orders to calculate shipping quotes, purchase labels, track shipments, and request label refunds.',
    configured: Boolean(runtimeCommerce?.shippoApiKeyConfigured),
    required: commerce?.shippingLabelProvider === 'shippo' || commerce?.shippingProvider === 'shippo',
    secret: true,
    example: '<shippo-api-key>',
  },
  {
    provider: 'commerce',
    key: 'BACKY_SHIPPO_API_BASE_URL',
    aliases: ['SHIPPO_API_BASE_URL'],
    label: 'Shippo API base URL',
    description: 'Optional Shippo API base URL override for smoke tests, sandbox adapters, and private network routing.',
    configured: Boolean(runtimeCommerce?.shippoApiBaseUrl),
    required: false,
    valueHint: runtimeCommerce?.shippoApiBaseUrl,
    example: 'https://api.goshippo.com',
  },
  {
    provider: 'interactiveComponents',
    key: 'BACKY_COMPONENT_REGISTRY_PROVIDER',
    aliases: ['BACKY_INTERACTIVE_COMPONENT_REGISTRY_PROVIDER'],
    label: 'Interactive component registry',
    description: 'Selects where trusted interactive figures and code component bundle metadata are resolved.',
    configured: Boolean(runtimeInteractiveComponents?.registryConfigured),
    required: true,
    valueHint: runtimeInteractiveComponents?.registryProvider,
    example: 'local',
  },
  {
    provider: 'interactiveComponents',
    key: 'BACKY_COMPONENT_REGISTRY_SIGNING_KEY',
    aliases: ['BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY'],
    label: 'Component registry signing key',
    description: 'Server-only signing key used to verify and publish versioned interactive component bundles.',
    configured: Boolean(runtimeInteractiveComponents?.signingKeyConfigured),
    required: Boolean(runtimeInteractiveComponents?.customCodeEnabled),
    secret: true,
    example: '<component-registry-signing-key>',
  },
  {
    provider: 'interactiveComponents',
    key: 'BACKY_COMPONENT_SANDBOX_ORIGIN',
    aliases: ['BACKY_INTERACTIVE_SANDBOX_ORIGIN'],
    label: 'Code component sandbox origin',
    description: 'Dedicated origin used for sandboxed iframe execution of fully custom interactive code.',
    configured: Boolean(runtimeInteractiveComponents?.sandboxOrigin),
    required: Boolean(runtimeInteractiveComponents?.customCodeEnabled),
    valueHint: runtimeInteractiveComponents?.sandboxOrigin,
    example: 'https://components.example.com',
  },
  {
    provider: 'interactiveComponents',
    key: 'BACKY_COMPONENT_SANDBOX_CSP',
    aliases: ['BACKY_INTERACTIVE_SANDBOX_CSP'],
    label: 'Code component sandbox CSP',
    description: 'Content Security Policy applied to custom component iframe documents.',
    configured: Boolean(runtimeInteractiveComponents?.cspConfigured),
    required: Boolean(runtimeInteractiveComponents?.customCodeEnabled),
    valueHint: runtimeInteractiveComponents?.cspConfigured ? 'configured' : undefined,
    example: "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  },
  {
    provider: 'vercel',
    key: 'VERCEL_TOKEN',
    aliases: ['BACKY_VERCEL_TOKEN'],
    label: 'Vercel deploy token',
    description: 'Server-only token for future Vercel deploy, domain, and project orchestration workflows.',
    configured: Boolean(runtimeVercel?.tokenConfigured),
    required: Boolean(vercel?.autoDeploy || vercel?.previewDeployments),
    secret: true,
    example: '<vercel-api-token>',
  },
  {
    provider: 'vercel',
    key: 'VERCEL_TEAM_ID',
    aliases: ['BACKY_VERCEL_TEAM_ID'],
    label: 'Vercel team',
    description: 'Optional team owner for deployments, domains, and account-scoped workflows.',
    configured: configuredValue(runtimeVercel?.teamId, vercel?.teamSlug),
    required: false,
    valueHint: runtimeVercel?.teamId || vercel?.teamSlug,
    example: 'team_xxxxxxxxxxxxxxxxxxxx',
  },
  {
    provider: 'vercel',
    key: 'BACKY_PUBLIC_APP_URL',
    aliases: ['VERCEL_URL'],
    label: 'Public app URL',
    description: 'Canonical hosted URL used in API contracts, callbacks, previews, and frontend handoff.',
    configured: configuredValue(runtimeVercel?.url, vercel?.productionDomain),
    required: true,
    valueHint: runtimeVercel?.url || vercel?.productionDomain,
    example: 'https://backy.example.com',
  },
  {
    provider: 'publicApi',
    key: 'BACKY_CORS_ALLOWED_ORIGINS',
    label: 'Custom frontend CORS origins',
    description: 'Comma-separated exact browser origins allowed to read Backy public/admin API responses and exposed contract headers.',
    configured: Boolean(runtimePublicApi?.corsAllowedOriginsConfigured),
    required: false,
    valueHint: runtimePublicApi?.allowedOrigins?.join(', '),
    example: 'https://www.example.com,https://app.example.com',
  },
];

const formatEnvTemplate = (
  contracts: InfrastructureEnvContract[],
  provider?: InfrastructureEnvProvider,
) => contracts
  .filter((item) => !provider || item.provider === provider)
  .map((item) => {
    const value = item.secret ? item.example : item.valueHint || item.example;
    return `${item.key}=${value}`;
  })
  .join('\n');

const RUNTIME_CARD_DETAIL_LIMIT = 6;

const runtimeCardTestIdForTitle = (title: string) => (
  `settings-runtime-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
);

function RuntimeCard({
  title,
  description,
  status,
  configured,
  details,
}: {
  title: string;
  description: string;
  status: string;
  configured: boolean;
  details: Array<{ label: string; value?: string | boolean | null }>;
}) {
  const runtimeCardTestId = runtimeCardTestIdForTitle(title);
  const visibleDetails = details.slice(0, RUNTIME_CARD_DETAIL_LIMIT);
  const extraDetails = details.slice(RUNTIME_CARD_DETAIL_LIMIT);

  const renderDetailRow = (item: { label: string; value?: string | boolean | null }) => (
    <div key={item.label} className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{item.label}</dt>
      <dd className="max-w-[60%] truncate text-right font-mono text-xs">
        {item.value === true ? 'yes' : item.value === false ? 'no' : item.value || 'not set'}
      </dd>
    </div>
  );

  return (
    <Panel
      data-testid={runtimeCardTestId}
      data-detail-count={details.length}
      data-visible-detail-count={visibleDetails.length}
      data-collapsible={String(extraDetails.length > 0)}
    >
      <PanelHeader
        title={title}
        description={description}
        action={
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
              configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}
          >
            {status}
          </span>
        }
      />
      <PanelContent>
        <dl className="grid gap-3 text-sm" data-testid={`${runtimeCardTestId}-primary-details`}>
          {visibleDetails.map(renderDetailRow)}
        </dl>
        {extraDetails.length > 0 && (
          <details
            className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
            data-testid={`${runtimeCardTestId}-extra-details`}
            data-default-collapsed="true"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-xs font-semibold text-muted-foreground focus-ring">
              <span>Show {extraDetails.length} provider rows</span>
              <span className="font-mono text-[10px] text-muted-foreground">{details.length} total</span>
            </summary>
            <dl className="mt-3 grid gap-3 border-t border-border pt-3 text-sm">
              {extraDetails.map(renderDetailRow)}
            </dl>
          </details>
        )}
      </PanelContent>
    </Panel>
  );
}

function InfrastructureEnvContractPanel({
  contracts,
  copiedProfile,
  disabled = false,
  onCopy,
}: {
  contracts: InfrastructureEnvContract[];
  copiedProfile: string;
  disabled?: boolean;
  onCopy: (label: string, provider?: InfrastructureEnvProvider) => void;
}) {
  const configuredCount = contracts.filter((item) => item.configured).length;
  const requiredOpenCount = contracts.filter((item) => item.required && !item.configured).length;
  const profiles: Array<{ label: string; provider?: InfrastructureEnvProvider }> = [
    { label: 'all env' },
    { label: 'public api', provider: 'publicApi' },
    { label: 'supabase', provider: 'supabase' },
    { label: 'vercel', provider: 'vercel' },
    { label: 'media scanner', provider: 'mediaScanner' },
    { label: 'notifications', provider: 'notifications' },
    { label: 'commerce', provider: 'commerce' },
  ];
  const providerSummary = profiles
    .filter((profile): profile is { label: string; provider: InfrastructureEnvProvider } => Boolean(profile.provider))
    .map((profile) => {
      const providerContracts = contracts.filter((item) => item.provider === profile.provider);
      return {
        ...profile,
        total: providerContracts.length,
        configured: providerContracts.filter((item) => item.configured).length,
        openRequired: providerContracts.filter((item) => item.required && !item.configured).length,
      };
    });

  return (
    <Panel>
      <PanelHeader
        title="Deployment env contract"
        description="Copy the environment contract needed for Vercel and Supabase without exposing stored secrets in Backy."
        icon={<Server className="size-4" />}
        action={
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
              requiredOpenCount === 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}
          >
            {configuredCount}/{contracts.length} detected
          </span>
        }
      />
      <PanelContent>
        <div className="flex flex-wrap gap-2">
          {profiles.map((profile) => (
            <Button
              key={profile.label}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onCopy(profile.label, profile.provider)}
              iconStart={copiedProfile === profile.label ? <Check className="size-4" /> : <Copy className="size-4" />}
            >
              {copiedProfile === profile.label ? 'Copied' : `Copy ${profile.label}`}
            </Button>
          ))}
        </div>

        {requiredOpenCount > 0 && (
          <Notice tone="warning" className="mt-4">
            {requiredOpenCount} required environment {requiredOpenCount === 1 ? 'variable is' : 'variables are'} still missing for the selected infrastructure options.
          </Notice>
        )}

        <div className="mt-4 grid gap-2 md:grid-cols-3" data-testid="settings-env-validation-matrix">
          {providerSummary.map((profile) => (
            <div key={profile.provider} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold capitalize text-foreground">{profile.label}</span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  profile.openRequired === 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}
                >
                  {profile.openRequired === 0 ? 'OK' : `${profile.openRequired} missing`}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {profile.configured}/{profile.total} variables detected or supplied as non-secret metadata.
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[minmax(180px,0.9fr)_minmax(180px,1fr)_120px] border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground max-lg:hidden">
            <div>Variable</div>
            <div>Purpose</div>
            <div className="text-right">Status</div>
          </div>
          <div className="divide-y divide-border">
            {contracts.map((item) => (
              <div
                key={item.key}
                className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[minmax(180px,0.9fr)_minmax(180px,1fr)_120px] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.key}</code>
                    {item.required && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Required
                      </span>
                    )}
                    {item.secret && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Secret
                      </span>
                    )}
                  </div>
                  {item.aliases && item.aliases.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Aliases: {item.aliases.join(', ')}
                    </p>
                  )}
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  <div className="font-medium text-foreground">{item.label}</div>
                  <p>{item.description}</p>
                  {item.valueHint && !item.secret && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.valueHint}</p>
                  )}
                </div>
                <div className="flex justify-start lg:justify-end">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                      item.configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                    )}
                  >
                    {item.configured ? 'Detected' : 'Missing'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}

function InfrastructureSettings({
  integrations,
  deliveryMode,
  runtimeDatabase,
  runtimeStorage,
  runtimeSupabase,
  runtimeMediaScanner,
  runtimeVercel,
  runtimeNotifications,
  runtimeCommerce,
  runtimeInteractiveComponents,
  runtimePublicApi,
  envContract,
  disabled = false,
  mediaOnly = false,
  providerCertificationControlsDisabled = false,
  providerCertificationControlsTitle,
  providerCertificationScenarioEvidence,
  onCopyProviderCertificationHandoff,
  onDownloadProviderCertificationHandoff,
  onChange,
}: {
  integrations: IntegrationSettings;
  deliveryMode: SiteSettingsInput['deliveryMode'];
  runtimeDatabase?: SiteSettingsInput['runtimeDatabase'];
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  runtimeSupabase?: SiteSettingsInput['runtimeSupabase'];
  runtimeMediaScanner?: SiteSettingsInput['runtimeMediaScanner'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  runtimeNotifications?: SiteSettingsInput['runtimeNotifications'];
  runtimeCommerce?: SiteSettingsInput['runtimeCommerce'];
  runtimeInteractiveComponents?: SiteSettingsInput['runtimeInteractiveComponents'];
  runtimePublicApi?: SiteSettingsInput['runtimePublicApi'];
  envContract: InfrastructureEnvContract[];
  disabled?: boolean;
  mediaOnly?: boolean;
  providerCertificationControlsDisabled?: boolean;
  providerCertificationControlsTitle?: string;
  providerCertificationScenarioEvidence: SettingsProviderCertificationScenarioEvidence;
  onCopyProviderCertificationHandoff: () => void;
  onDownloadProviderCertificationHandoff: () => void;
  onChange: Dispatch<SetStateAction<IntegrationSettings>>;
}) {
  const storage: StorageSettings = integrations.storage || {};
  const supabase: SupabaseSettings = integrations.supabase || {};
  const vercel: VercelSettings = integrations.vercel || {};
  const deploymentHistory: SettingsDeploymentHistoryEntry[] = vercel.deploymentHistory || [];
  const storageDisabled = disabled;
  const supabaseDisabled = disabled;
  const vercelDisabled = disabled || mediaOnly;
  const publicApiBase = useMemo(() => getApiBase('public'), []);
  const adminApiBase = useMemo(() => getApiBase('admin'), []);
  const settingsMediaStorageHandoff = useMemo(() => buildSettingsMediaStorageHandoff({
    integrations,
    runtimeStorage,
    runtimeSupabase,
    publicApiBase,
    adminApiBase,
  }), [
    adminApiBase,
    integrations,
    publicApiBase,
    runtimeStorage,
    runtimeSupabase,
  ]);
  const settingsMediaStorageHandoffText = useMemo(() => JSON.stringify(settingsMediaStorageHandoff, null, 2), [settingsMediaStorageHandoff]);
  const [copiedEnvProfile, setCopiedEnvProfile] = useState('');
  const [mediaStorageHandoffNotice, setMediaStorageHandoffNotice] = useState('');
  const [isCheckingInfrastructure, setIsCheckingInfrastructure] = useState(false);
  const [infrastructureCheckError, setInfrastructureCheckError] = useState('');
  const [infrastructureDiagnostics, setInfrastructureDiagnostics] = useState<SettingsInfrastructureDiagnostic[] | null>(null);
  const [isRunningStorageProbe, setIsRunningStorageProbe] = useState(false);
  const [storageProbeError, setStorageProbeError] = useState('');
  const [storageProvisioningResult, setStorageProvisioningResult] = useState<SettingsStorageProvisioningResult | null>(null);
  const [isRunningStorageRotationProbe, setIsRunningStorageRotationProbe] = useState(false);
  const [storageRotationProbeError, setStorageRotationProbeError] = useState('');
  const [storageRotationProbeResult, setStorageRotationProbeResult] = useState<SettingsStorageCredentialRotationProbeResult | null>(null);
  const [isRunningStorageSecretManager, setIsRunningStorageSecretManager] = useState(false);
  const [storageSecretManagerError, setStorageSecretManagerError] = useState('');
  const [storageSecretManagerResult, setStorageSecretManagerResult] = useState<SettingsStorageSecretManagerResult | null>(null);
  const [settingsCertificationCommandOptions, setSettingsCertificationCommandOptions] = useState<SettingsCertificationCommandOptions>(
    DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS,
  );
  const [copiedCertificationCommand, setCopiedCertificationCommand] = useState(false);
  const [copiedCertificationEnvTemplate, setCopiedCertificationEnvTemplate] = useState(false);
  const [copiedCertificationEvidencePacket, setCopiedCertificationEvidencePacket] = useState(false);
  const settingsCertificationCommand = useMemo(
    () => buildSettingsProviderCertificationCommand(settingsCertificationCommandOptions),
    [settingsCertificationCommandOptions],
  );
  const settingsCertificationEnvTemplate = useMemo(
    () => buildSettingsProviderCertificationEnvTemplate(settingsCertificationCommandOptions),
    [settingsCertificationCommandOptions],
  );
  const settingsCertificationRequiredAliases = useMemo(
    () => buildSettingsProviderCertificationRequiredAliases(settingsCertificationCommandOptions),
    [settingsCertificationCommandOptions],
  );
  const settingsCertificationRuntimeEvidence = useMemo(() => buildSettingsProviderRuntimeEvidence({
    database: runtimeDatabase || null,
    storage: runtimeStorage || null,
    supabase: runtimeSupabase || null,
    vercel: runtimeVercel || null,
    mediaScanner: runtimeMediaScanner || null,
    notifications: runtimeNotifications || null,
    commerce: runtimeCommerce || null,
    interactiveComponents: runtimeInteractiveComponents || null,
    publicApi: runtimePublicApi || null,
  }), [
    runtimeCommerce,
    runtimeDatabase,
    runtimeInteractiveComponents,
    runtimeMediaScanner,
    runtimeNotifications,
    runtimePublicApi,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const settingsCertificationArtifactReadiness = useMemo(() => buildSettingsProviderCertificationArtifactReadiness({
    runtimeStorage,
    runtimeVercel,
    runtimeNotifications,
    runtimePublicApi,
    runtimeCommerce,
    integrations,
    runtimeEvidence: settingsCertificationRuntimeEvidence,
    scenarioEvidence: providerCertificationScenarioEvidence,
  }), [
    integrations,
    providerCertificationScenarioEvidence,
    runtimeCommerce,
    runtimeNotifications,
    runtimePublicApi,
    runtimeStorage,
    runtimeVercel,
    settingsCertificationRuntimeEvidence,
  ]);
  const settingsCertificationEvidencePacket = useMemo(() => buildSettingsProviderCertificationEvidencePacket({
    options: settingsCertificationCommandOptions,
    command: settingsCertificationCommand,
    envTemplate: settingsCertificationEnvTemplate,
    requiredAliases: settingsCertificationRequiredAliases,
    runtimeEvidence: settingsCertificationRuntimeEvidence,
    scenarioEvidence: providerCertificationScenarioEvidence,
    artifactReadiness: settingsCertificationArtifactReadiness,
  }), [
    providerCertificationScenarioEvidence,
    settingsCertificationArtifactReadiness,
    settingsCertificationCommand,
    settingsCertificationCommandOptions,
    settingsCertificationEnvTemplate,
    settingsCertificationRequiredAliases,
    settingsCertificationRuntimeEvidence,
  ]);
  const settingsCertificationEvidencePacketText = useMemo(
    () => JSON.stringify(settingsCertificationEvidencePacket, null, 2),
    [settingsCertificationEvidencePacket],
  );
  const settingsCertificationHasSelectedFamily = hasSettingsCertificationGroup(settingsCertificationCommandOptions) ||
    settingsCertificationCommandOptions.certifyCommerce;

  const updateSettingsCertificationCommandOptions = (next: Partial<SettingsCertificationCommandOptions>) => {
    setSettingsCertificationCommandOptions((current) => ({
      ...current,
      ...next,
    }));
  };

  const updateStorage = (next: Partial<StorageSettings>) => {
    if (storageDisabled) return;

    onChange((current) => ({
      ...current,
      storage: {
        ...(current.storage || {}),
        ...next,
      },
    }));
  };

  const copyMediaStorageHandoff = async () => {
    if (storageDisabled) return;

    try {
      await navigator.clipboard.writeText(settingsMediaStorageHandoffText);
      setMediaStorageHandoffNotice('Media storage handoff copied.');
    } catch {
      setMediaStorageHandoffNotice(settingsMediaStorageHandoffText);
    }
  };

  const updateSupabase = (next: Partial<SupabaseSettings>) => {
    if (supabaseDisabled) return;

    onChange((current) => ({
      ...current,
      supabase: {
        ...(current.supabase || {}),
        ...next,
      },
    }));
  };

  const updateVercel = (next: Partial<VercelSettings>) => {
    if (vercelDisabled) return;

    onChange((current) => ({
      ...current,
      vercel: {
        ...(current.vercel || {}),
        ...next,
      },
    }));
  };

  const useRuntimeStorage = () => {
    if (storageDisabled) return;

    updateStorage({
      provider: runtimeStorage?.provider || storage.provider || 'local',
      bucket: runtimeStorage?.bucket || storage.bucket || '',
      publicBaseUrl: runtimeStorage?.publicUrl || storage.publicBaseUrl || '',
      pathPrefix: runtimeStorage?.basePath || storage.pathPrefix || '',
      imageTransformsEnabled: storage.imageTransformsEnabled !== false,
    });
  };

  const useRuntimeSupabase = () => {
    if (supabaseDisabled) return;

    const projectUrl = runtimeSupabase?.projectUrl || supabase.projectUrl || '';
    const projectRef = runtimeSupabase?.projectRef || supabase.projectRef || '';
    const storageBucket = runtimeSupabase?.storageBucket || storage.bucket || '';
    const publicBaseUrl = storage.publicBaseUrl || buildSupabaseStoragePublicBaseUrl(projectUrl, storageBucket);
    const shouldUseSupabaseStorage = Boolean(projectUrl || storageBucket || storage.provider === 'supabase');

    onChange((current) => ({
      ...current,
      supabase: {
        ...(current.supabase || {}),
        projectUrl,
        projectRef,
        databaseEnabled: Boolean(runtimeSupabase?.databaseUrlConfigured || current.supabase?.databaseEnabled),
        storageEnabled: Boolean(storageBucket || current.supabase?.storageEnabled),
        authEnabled: Boolean(runtimeSupabase?.anonKeyConfigured || current.supabase?.authEnabled),
      },
      storage: {
        ...(current.storage || {}),
        provider: shouldUseSupabaseStorage ? 'supabase' : current.storage?.provider,
        bucket: storageBucket,
        publicBaseUrl,
        imageTransformsEnabled: current.storage?.imageTransformsEnabled !== false,
      },
    }));
  };

  const useRuntimeVercel = () => {
    if (vercelDisabled) return;

    updateVercel({
      projectId: runtimeVercel?.projectId || vercel.projectId || '',
      productionDomain: runtimeVercel?.url || vercel.productionDomain || '',
    });
  };

  const copyEnvTemplate = async (label: string, provider?: InfrastructureEnvProvider) => {
    if (disabled) return;

    const value = formatEnvTemplate(envContract, provider);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedEnvProfile(label);
      setTimeout(() => {
        setCopiedEnvProfile((current) => (current === label ? '' : current));
      }, 1400);
    } catch {
      setCopiedEnvProfile('');
    }
  };

  const copySettingsProviderCertificationCommand = async () => {
    if (providerCertificationControlsDisabled || !settingsCertificationHasSelectedFamily) return;

    try {
      await navigator.clipboard.writeText(settingsCertificationCommand);
      setCopiedCertificationCommand(true);
      setTimeout(() => {
        setCopiedCertificationCommand(false);
      }, 1400);
    } catch {
      setCopiedCertificationCommand(false);
    }
  };

  const copySettingsProviderCertificationEnvTemplate = async () => {
    if (providerCertificationControlsDisabled || !settingsCertificationHasSelectedFamily) return;

    try {
      await navigator.clipboard.writeText(settingsCertificationEnvTemplate);
      setCopiedCertificationEnvTemplate(true);
      setTimeout(() => {
        setCopiedCertificationEnvTemplate(false);
      }, 1400);
    } catch {
      setCopiedCertificationEnvTemplate(false);
    }
  };

  const copySettingsProviderCertificationEvidencePacket = async () => {
    if (providerCertificationControlsDisabled || settingsCertificationEvidencePacket.selectedFamilies.length === 0) return;

    try {
      await navigator.clipboard.writeText(settingsCertificationEvidencePacketText);
      setCopiedCertificationEvidencePacket(true);
      setTimeout(() => {
        setCopiedCertificationEvidencePacket(false);
      }, 1400);
    } catch {
      setCopiedCertificationEvidencePacket(false);
    }
  };

  const providerRuntimeEvidenceRows = useMemo(() => {
    const commerceReady = Boolean(
      runtimeCommerce?.webhookSecretConfigured ||
      runtimeCommerce?.stripeSecretConfigured ||
      runtimeCommerce?.paypalAccessTokenConfigured ||
      runtimeCommerce?.paddleApiKeyConfigured ||
      runtimeCommerce?.squareAccessTokenConfigured ||
      runtimeCommerce?.adyenApiKeyConfigured ||
      runtimeCommerce?.mollieApiKeyConfigured ||
      (runtimeCommerce?.razorpayKeyIdConfigured && runtimeCommerce?.razorpayKeySecretConfigured) ||
      runtimeCommerce?.easyPostApiKeyConfigured ||
      runtimeCommerce?.shippoApiKeyConfigured ||
      runtimeCommerce?.shopifyAdminAccessTokenConfigured ||
      runtimeCommerce?.bigCommerceAccessTokenConfigured ||
      runtimeCommerce?.wooCommerceConsumerKeyConfigured ||
      runtimeCommerce?.etsyAccessTokenConfigured ||
      runtimeCommerce?.magentoAccessTokenConfigured
    );

    return [
      {
        label: 'Database',
        ready: Boolean(runtimeDatabase?.configured),
        status: runtimeDatabase?.configured ? 'Configured' : 'Needs env',
        detail: runtimeDatabase
          ? `${runtimeDatabase.provider || runtimeDatabase.mode || 'database'}${runtimeDatabase.host ? ` on ${runtimeDatabase.host}` : ''}`
          : 'Runtime database diagnostics have not loaded.',
        missing: runtimeDatabase?.missing || [],
      },
      {
        label: 'Storage',
        ready: Boolean(runtimeStorage?.configured),
        status: runtimeStorage?.configured ? 'Configured' : 'Needs env',
        detail: runtimeStorage
          ? `${runtimeStorage.provider} storage${runtimeStorage.bucket ? ` bucket ${runtimeStorage.bucket}` : ''}`
          : 'Storage runtime diagnostics have not loaded.',
        missing: runtimeStorage?.missing || [],
      },
      {
        label: 'Supabase',
        ready: Boolean(runtimeSupabase?.configured),
        status: runtimeSupabase?.configured ? 'Configured' : 'Needs env',
        detail: runtimeSupabase
          ? `Project ${runtimeSupabase.projectRef || runtimeSupabase.projectUrl || 'metadata pending'}`
          : 'Supabase runtime diagnostics have not loaded.',
        missing: runtimeSupabase?.missing || [],
      },
      {
        label: 'Vercel',
        ready: Boolean(runtimeVercel?.configured),
        status: runtimeVercel?.configured ? 'Configured' : 'Needs env',
        detail: runtimeVercel
          ? `Project ${runtimeVercel.projectId || runtimeVercel.url || 'metadata pending'}`
          : 'Vercel runtime diagnostics have not loaded.',
        missing: runtimeVercel?.missing || [],
      },
      {
        label: 'Notifications',
        ready: Boolean(runtimeNotifications?.productionReady || runtimeNotifications?.configured),
        status: runtimeNotifications?.productionReady ? 'Production ready' : runtimeNotifications?.configured ? 'Local/dev ready' : 'Needs env',
        detail: runtimeNotifications
          ? `${runtimeNotifications.emailProvider || 'email'} delivery${runtimeNotifications.from ? ` from ${runtimeNotifications.from}` : ''}`
          : 'Notification runtime diagnostics have not loaded.',
        missing: runtimeNotifications?.missing || [],
      },
      {
        label: 'Commerce',
        ready: commerceReady,
        status: commerceReady ? 'Provider env ready' : 'Needs env',
        detail: runtimeCommerce
          ? `Selected providers: ${[
            runtimeCommerce.paymentProvider,
            runtimeCommerce.taxProvider,
            runtimeCommerce.shippingProvider,
            runtimeCommerce.discountProvider,
          ].filter(Boolean).join(', ') || 'metadata pending'}`
          : 'Commerce runtime diagnostics have not loaded.',
        missing: runtimeCommerce?.missing || [],
      },
      {
        label: 'Media scanner',
        ready: runtimeMediaScanner?.configured !== false,
        status: runtimeMediaScanner?.configured === false ? 'Needs env' : 'Configured',
        detail: runtimeMediaScanner
          ? `${runtimeMediaScanner.provider} scanner${runtimeMediaScanner.enabled ? ' enabled' : ' disabled'}`
          : 'Media scanner diagnostics have not loaded.',
        missing: runtimeMediaScanner?.missing || [],
      },
      {
        label: 'Interactive components',
        ready: runtimeInteractiveComponents?.configured !== false,
        status: runtimeInteractiveComponents?.configured === false ? 'Needs sandbox env' : 'Platform ready',
        detail: runtimeInteractiveComponents
          ? `${runtimeInteractiveComponents.registryProvider || 'registry'} runtime${runtimeInteractiveComponents.customCodeEnabled ? ' with custom code enabled' : ''}`
          : 'Interactive component diagnostics have not loaded.',
        missing: runtimeInteractiveComponents?.missing || [],
      },
      {
        label: 'Public API/CORS',
        ready: Boolean(runtimePublicApi?.corsAllowedOriginsConfigured && runtimePublicApi.exposedContractHeaders.length),
        status: runtimePublicApi?.corsAllowedOriginsConfigured ? 'Configured' : 'Needs origins',
        detail: runtimePublicApi
          ? `${runtimePublicApi.corsAllowedOriginCount} allowed origin${runtimePublicApi.corsAllowedOriginCount === 1 ? '' : 's'} with ${runtimePublicApi.exposedContractHeaders.length} exposed contract headers`
          : 'Public API runtime diagnostics have not loaded.',
        missing: runtimePublicApi?.missing || [],
      },
    ];
  }, [
    runtimeCommerce,
    runtimeDatabase,
    runtimeInteractiveComponents,
    runtimeMediaScanner,
    runtimeNotifications,
    runtimePublicApi,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const providerRuntimeEvidenceReadyCount = providerRuntimeEvidenceRows.filter((row) => row.ready).length;
  const settingsCertificationSelectedFamilySummary = settingsCertificationEvidencePacket.selectedFamilies.length > 0
    ? settingsCertificationEvidencePacket.selectedFamilies.join(', ')
    : 'Select storage, Vercel, notifications, Public API/CORS, or commerce to build a live run.';
  const settingsCertificationRuntimeMissingAliasPreview = settingsCertificationRuntimeEvidence.missingInputAliases.length > 0
    ? settingsCertificationRuntimeEvidence.missingInputAliases.slice(0, 4).join(', ')
    : 'No missing runtime aliases detected.';
  const settingsCertificationRuntimeGapDetail = settingsCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.length > 0
    ? `Selected gaps: ${settingsCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.join(', ')}`
    : settingsCertificationRuntimeMissingAliasPreview;
  const settingsCertificationReadinessItems = [
    {
      label: 'Selected families',
      value: String(settingsCertificationEvidencePacket.selectedFamilies.length),
      detail: settingsCertificationSelectedFamilySummary,
    },
    {
      label: 'Runtime inputs',
      value: `${providerRuntimeEvidenceReadyCount}/${providerRuntimeEvidenceRows.length} ready`,
      detail: settingsCertificationRuntimeGapDetail,
    },
    {
      label: 'Scenario coverage',
      value: `${providerCertificationScenarioEvidence.coverage.covered}/${providerCertificationScenarioEvidence.coverage.total}`,
      detail: providerCertificationScenarioEvidence.coverage.missing.length > 0
        ? `Missing: ${providerCertificationScenarioEvidence.coverage.missing.join(', ')}`
        : 'All Settings provider scenarios have evidence hooks.',
    },
    {
      label: 'Artifact output',
      value: SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV,
      detail: SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT,
    },
    {
      label: 'Gate command',
      value: 'ci:settings-provider-certification',
      detail: 'Run npm run ci:settings-provider-certification after live env aliases are populated.',
    },
    {
      label: 'Required site selector',
      value: 'BACKY_SETTINGS_CERTIFY_SITE_ID',
      detail: settingsCertificationEvidencePacket.target.siteId,
    },
  ];

  const runInfrastructureCheck = async () => {
    if (disabled || isCheckingInfrastructure) return;

    setIsCheckingInfrastructure(true);
    setInfrastructureCheckError('');
    try {
      const result = await validateSettingsInfrastructure(mediaOnly
        ? { deliveryMode, integrations: { storage, supabase } }
        : { deliveryMode, integrations, recordHistory: true });
      setInfrastructureDiagnostics(result.diagnostics);
      const historyEntry = result.historyEntry;
      if (historyEntry) {
        onChange((current) => ({
          ...current,
          vercel: {
            ...(current.vercel || {}),
            deploymentHistory: [
              historyEntry,
              ...((current.vercel?.deploymentHistory || []).filter((entry) => entry.id !== historyEntry.id)),
            ].slice(0, 10),
          },
        }));
      }
    } catch (error) {
      setInfrastructureCheckError(error instanceof Error ? error.message : 'Unable to run infrastructure check.');
    } finally {
      setIsCheckingInfrastructure(false);
    }
  };

  const runStorageProvisioningProbe = async () => {
    if (storageDisabled || isRunningStorageProbe) return;

    setIsRunningStorageProbe(true);
    setStorageProbeError('');
    setStorageProvisioningResult(null);
    try {
      const result = await runSettingsStorageProvisioningProbe();
      setStorageProvisioningResult(result);
    } catch (error) {
      setStorageProbeError(error instanceof Error ? error.message : 'Unable to run media storage provisioning probe.');
    } finally {
      setIsRunningStorageProbe(false);
    }
  };

  const runStorageRotationProbe = async () => {
    if (storageDisabled || isRunningStorageRotationProbe) return;

    setIsRunningStorageRotationProbe(true);
    setStorageRotationProbeError('');
    setStorageRotationProbeResult(null);
    try {
      const result = await runSettingsStorageCredentialRotationProbe();
      setStorageRotationProbeResult(result);
    } catch (error) {
      setStorageRotationProbeError(error instanceof Error ? error.message : 'Unable to run media storage credential rotation probe.');
    } finally {
      setIsRunningStorageRotationProbe(false);
    }
  };

  const runStorageSecretManager = async (mode: SettingsStorageSecretManagerResult['mode'], dryRun = true) => {
    if (storageDisabled || isRunningStorageSecretManager) return;

    setIsRunningStorageSecretManager(true);
    setStorageSecretManagerError('');
    setStorageSecretManagerResult(null);
    try {
      const result = await runSettingsStorageSecretManager({
        mode,
        dryRun,
        targetEnvironments: ['production', 'preview'],
      });
      setStorageSecretManagerResult(result);
    } catch (error) {
      setStorageSecretManagerError(error instanceof Error ? error.message : 'Unable to run media storage secret manager.');
    } finally {
      setIsRunningStorageSecretManager(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-lg font-semibold">Infrastructure connections</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Backy is the in-house CMS and API control plane. Supabase and Vercel are connected providers: metadata is stored here, while real tokens and database URLs stay in environment variables.
        </p>
      </div>

      {mediaOnly && (
        <Notice tone="info">
          Your account can update media storage and Supabase metadata. Vercel and full platform settings require settings.configure.
        </Notice>
      )}

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Ownership model</h4>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              This separates what Backy controls directly from what is detected or delegated to connected providers.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Backy + providers
          </span>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          {PLATFORM_RESPONSIBILITIES.map((item) => (
            <SettingsResponsibilityCard key={item.area} item={item} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <RuntimeCard
          title="Database runtime"
          description="Current persistence mode used by Backy APIs."
          status={runtimeDatabase?.configured ? 'Configured' : 'Needs config'}
          configured={Boolean(runtimeDatabase?.configured)}
          details={[
            { label: 'Mode', value: runtimeDatabase?.mode },
            { label: 'Provider', value: runtimeDatabase?.provider },
            { label: 'Host/path', value: runtimeDatabase?.host || runtimeDatabase?.path },
          ]}
        />
        <RuntimeCard
          title="Supabase runtime"
          description="Detected Supabase environment capability."
          status={runtimeSupabase?.configured ? 'Configured' : 'Needs env'}
          configured={Boolean(runtimeSupabase?.configured)}
          details={[
            { label: 'Project ref', value: runtimeSupabase?.projectRef },
            { label: 'Database URL', value: runtimeSupabase?.databaseUrlConfigured },
            { label: 'Storage bucket', value: runtimeSupabase?.storageBucket },
          ]}
        />
        <RuntimeCard
          title="Vercel runtime"
          description="Detected deployment metadata for hosted Backy."
          status={runtimeVercel?.configured ? 'Configured' : 'Needs env'}
          configured={Boolean(runtimeVercel?.configured)}
          details={[
            { label: 'On Vercel', value: runtimeVercel?.onVercel },
            { label: 'Project ID', value: runtimeVercel?.projectId },
            { label: 'Environment', value: runtimeVercel?.environment },
            { label: 'Deploy token', value: runtimeVercel?.tokenConfigured },
          ]}
        />
        <RuntimeCard
          title="Media scanner runtime"
          description="Detected upload safety scanning configuration."
          status={runtimeMediaScanner?.configured ? 'Configured' : 'Needs env'}
          configured={runtimeMediaScanner?.configured !== false}
          details={[
            { label: 'Provider', value: runtimeMediaScanner?.provider },
            { label: 'Enabled', value: runtimeMediaScanner?.enabled },
            { label: 'Endpoint', value: runtimeMediaScanner?.endpointConfigured || runtimeMediaScanner?.host },
            { label: 'Fail open', value: runtimeMediaScanner?.failOpen },
          ]}
        />
        <RuntimeCard
          title="Notification runtime"
          description="Detected transactional email delivery capability."
          status={runtimeNotifications?.productionReady ? 'Production ready' : runtimeNotifications?.configured ? 'Local/dev ready' : 'Needs env'}
          configured={Boolean(runtimeNotifications?.configured)}
          details={[
            { label: 'Email provider', value: runtimeNotifications?.emailProvider },
            { label: 'From', value: runtimeNotifications?.from },
            { label: 'Endpoint', value: runtimeNotifications?.endpointConfigured },
            { label: 'API key', value: runtimeNotifications?.apiKeyConfigured },
          ]}
        />
        <RuntimeCard
          title="Commerce runtime"
          description="Detected payment-provider webhook, catalog sync, subscription lifecycle, refund, and shipping-label execution capability."
          status={runtimeCommerce?.webhookSecretConfigured || runtimeCommerce?.stripeSecretConfigured || runtimeCommerce?.paypalAccessTokenConfigured || runtimeCommerce?.squareAccessTokenConfigured || runtimeCommerce?.adyenApiKeyConfigured || runtimeCommerce?.mollieApiKeyConfigured || (runtimeCommerce?.razorpayKeyIdConfigured && runtimeCommerce?.razorpayKeySecretConfigured) || runtimeCommerce?.easyPostApiKeyConfigured || runtimeCommerce?.shippoApiKeyConfigured || runtimeCommerce?.shopifyAdminAccessTokenConfigured || runtimeCommerce?.bigCommerceAccessTokenConfigured || runtimeCommerce?.wooCommerceConsumerKeyConfigured || (runtimeCommerce?.etsyAccessTokenConfigured && runtimeCommerce?.etsyApiKeyConfigured && runtimeCommerce?.etsyShopConfigured) || (runtimeCommerce?.magentoAccessTokenConfigured && runtimeCommerce?.magentoStoreConfigured) ? 'Provider env ready' : 'Needs env'}
          configured={Boolean(runtimeCommerce?.webhookSecretConfigured || runtimeCommerce?.stripeSecretConfigured || runtimeCommerce?.paypalAccessTokenConfigured || runtimeCommerce?.squareAccessTokenConfigured || runtimeCommerce?.adyenApiKeyConfigured || runtimeCommerce?.mollieApiKeyConfigured || (runtimeCommerce?.razorpayKeyIdConfigured && runtimeCommerce?.razorpayKeySecretConfigured) || runtimeCommerce?.easyPostApiKeyConfigured || runtimeCommerce?.shippoApiKeyConfigured || runtimeCommerce?.shopifyAdminAccessTokenConfigured || runtimeCommerce?.bigCommerceAccessTokenConfigured || runtimeCommerce?.wooCommerceConsumerKeyConfigured || (runtimeCommerce?.etsyAccessTokenConfigured && runtimeCommerce?.etsyApiKeyConfigured && runtimeCommerce?.etsyShopConfigured) || (runtimeCommerce?.magentoAccessTokenConfigured && runtimeCommerce?.magentoStoreConfigured)) || !runtimeCommerce?.webhookSecretReference}
          details={[
            { label: 'Secret ref', value: runtimeCommerce?.webhookSecretReference },
            { label: 'Secret source', value: runtimeCommerce?.webhookSecretSource },
            { label: 'Env keys', value: runtimeCommerce?.webhookSecretEnvKeys?.join(', ') },
            { label: 'Payment provider', value: runtimeCommerce?.paymentProvider },
            { label: 'Tax provider', value: runtimeCommerce?.taxProvider },
            { label: 'Shipping quote provider', value: runtimeCommerce?.shippingProvider },
            { label: 'Discount provider', value: runtimeCommerce?.discountProvider },
            { label: 'Stripe API key', value: runtimeCommerce?.stripeSecretConfigured },
            { label: 'Stripe API base URL', value: runtimeCommerce?.stripeApiBaseUrl },
            { label: 'Stripe API version', value: runtimeCommerce?.stripeApiVersion },
            { label: 'Stripe discount API base URL', value: runtimeCommerce?.stripeDiscountApiBaseUrl },
            { label: 'TaxJar API key', value: runtimeCommerce?.taxJarApiKeyConfigured },
            { label: 'TaxJar base URL', value: runtimeCommerce?.taxJarApiBaseUrl },
            { label: 'Avalara account', value: runtimeCommerce?.avalaraAccountConfigured },
            { label: 'Avalara license key', value: runtimeCommerce?.avalaraLicenseKeyConfigured },
            { label: 'Avalara company', value: runtimeCommerce?.avalaraCompanyCodeConfigured },
            { label: 'Avalara base URL', value: runtimeCommerce?.avalaraApiBaseUrl },
            { label: 'PayPal commerce token', value: runtimeCommerce?.paypalAccessTokenConfigured },
            { label: 'PayPal base URL', value: runtimeCommerce?.paypalApiBaseUrl },
            { label: 'Paddle API key', value: runtimeCommerce?.paddleApiKeyConfigured },
            { label: 'Paddle base URL', value: runtimeCommerce?.paddleApiBaseUrl },
            { label: 'Square commerce token', value: runtimeCommerce?.squareAccessTokenConfigured },
            { label: 'Square base URL', value: runtimeCommerce?.squareApiBaseUrl },
            { label: 'Adyen API key', value: runtimeCommerce?.adyenApiKeyConfigured },
            { label: 'Adyen merchant', value: runtimeCommerce?.adyenMerchantAccountConfigured },
            { label: 'Adyen base URL', value: runtimeCommerce?.adyenApiBaseUrl },
            { label: 'Adyen Recurring base URL', value: runtimeCommerce?.adyenRecurringApiBaseUrl },
            { label: 'Mollie API key', value: runtimeCommerce?.mollieApiKeyConfigured },
            { label: 'Mollie base URL', value: runtimeCommerce?.mollieApiBaseUrl },
            { label: 'Razorpay key ID', value: runtimeCommerce?.razorpayKeyIdConfigured },
            { label: 'Razorpay key secret', value: runtimeCommerce?.razorpayKeySecretConfigured },
            { label: 'Razorpay base URL', value: runtimeCommerce?.razorpayApiBaseUrl },
            { label: 'Label provider', value: runtimeCommerce?.shippingLabelProvider },
            { label: 'EasyPost API key', value: runtimeCommerce?.easyPostApiKeyConfigured },
            { label: 'EasyPost base URL', value: runtimeCommerce?.easyPostApiBaseUrl },
            { label: 'Shippo API key', value: runtimeCommerce?.shippoApiKeyConfigured },
            { label: 'Shippo base URL', value: runtimeCommerce?.shippoApiBaseUrl },
            { label: 'Shopify catalog token', value: runtimeCommerce?.shopifyAdminAccessTokenConfigured },
            { label: 'Shopify store', value: runtimeCommerce?.shopifyStoreDomain || runtimeCommerce?.shopifyStoreConfigured },
            { label: 'Shopify Admin API base URL', value: runtimeCommerce?.shopifyAdminApiBaseUrl },
            { label: 'BigCommerce catalog token', value: runtimeCommerce?.bigCommerceAccessTokenConfigured },
            { label: 'BigCommerce store', value: runtimeCommerce?.bigCommerceStoreHash || runtimeCommerce?.bigCommerceStoreConfigured },
            { label: 'BigCommerce API base URL', value: runtimeCommerce?.bigCommerceApiBaseUrl },
            { label: 'WooCommerce consumer key', value: runtimeCommerce?.wooCommerceConsumerKeyConfigured },
            { label: 'WooCommerce consumer secret', value: runtimeCommerce?.wooCommerceConsumerSecretConfigured },
            { label: 'WooCommerce store', value: runtimeCommerce?.wooCommerceStoreUrl || runtimeCommerce?.wooCommerceStoreConfigured },
            { label: 'WooCommerce API base URL', value: runtimeCommerce?.wooCommerceApiBaseUrl },
            { label: 'Etsy access token', value: runtimeCommerce?.etsyAccessTokenConfigured },
            { label: 'Etsy API key', value: runtimeCommerce?.etsyApiKeyConfigured },
            { label: 'Etsy shop', value: runtimeCommerce?.etsyShopId || runtimeCommerce?.etsyShopConfigured },
            { label: 'Etsy API base URL', value: runtimeCommerce?.etsyApiBaseUrl },
            { label: 'Magento catalog token', value: runtimeCommerce?.magentoAccessTokenConfigured },
            { label: 'Magento store', value: runtimeCommerce?.magentoStoreUrl || runtimeCommerce?.magentoStoreConfigured },
            { label: 'Magento API base URL', value: runtimeCommerce?.magentoApiBaseUrl },
          ]}
        />
        <RuntimeCard
          title="Interactive component runtime"
          description="Detected registry and sandbox capability for page/blog animations, simulations, and custom code components."
          status={runtimeInteractiveComponents?.configured ? 'Platform ready' : runtimeInteractiveComponents?.customCodeEnabled ? 'Needs sandbox env' : 'Trusted blocks ready'}
          configured={runtimeInteractiveComponents?.configured !== false}
          details={[
            { label: 'Registry provider', value: runtimeInteractiveComponents?.registryProvider },
            { label: 'Registry configured', value: runtimeInteractiveComponents?.registryConfigured },
            { label: 'Bundle base URL', value: runtimeInteractiveComponents?.bundleBaseUrl },
            { label: 'Signing key', value: runtimeInteractiveComponents?.signingKeyConfigured },
            { label: 'Review required', value: runtimeInteractiveComponents?.reviewRequired },
            { label: 'Custom code enabled', value: runtimeInteractiveComponents?.customCodeEnabled },
            { label: 'Sandbox origin', value: runtimeInteractiveComponents?.sandboxOrigin },
            { label: 'Sandbox CSP', value: runtimeInteractiveComponents?.cspConfigured },
            { label: 'Iframe sandbox', value: runtimeInteractiveComponents?.iframeSandbox },
            { label: 'Allowed connect-src', value: runtimeInteractiveComponents?.allowedConnectSrc },
          ]}
        />
      </div>

      <Panel data-testid="settings-release-certification-runbook">
        <PanelHeader
          title="Release certification runbook"
          description="Use this gate before treating Backy as production-ready for a real Supabase/Postgres database and live providers."
          icon={<CheckCircle2 className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={providerCertificationControlsDisabled}
                title={providerCertificationControlsTitle}
                onClick={onCopyProviderCertificationHandoff}
                iconStart={<Copy className="size-4" />}
                data-testid="settings-provider-certification-copy-button"
              >
                Copy provider handoff
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={providerCertificationControlsDisabled}
                title={providerCertificationControlsTitle}
                onClick={onDownloadProviderCertificationHandoff}
                iconStart={<Download className="size-4" />}
                data-testid="settings-provider-certification-download-button"
              >
                Download provider JSON
              </Button>
            </div>
          }
        />
        <PanelContent>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflow</div>
              <div className="mt-2 font-mono text-sm text-foreground">.github/workflows/backy-release-certification.yml</div>
              <div className="mt-2 text-xs text-muted-foreground">Run local preflight first: <span className="font-mono">npm run test:release-certification-preflight-contract</span></div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Database gate</div>
              <div className="mt-2 text-sm text-foreground">Enable <span className="font-mono">certify_database</span> only with a disposable migrated Supabase/Postgres database.</div>
              <div className="mt-2 text-xs text-muted-foreground">Requires <span className="font-mono">BACKY_DATABASE_URL</span> or <span className="font-mono">DATABASE_URL</span>, then runs <span className="font-mono">ci:forms-postgres</span> and <span className="font-mono">ci:sdk-postgres-smoke</span>.</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider gates</div>
              <div className="mt-2 text-sm text-foreground">Enable Settings and Commerce provider certification only after live credentials are configured.</div>
              <div className="mt-2 text-xs text-muted-foreground">Covers storage, credential rotation, Vercel secret planning, notification delivery, and commerce providers.</div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-background p-3" data-testid="settings-provider-certification-readiness-summary">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Certification readiness summary</div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                  One-screen operator summary for the remaining Settings provider gate before opening the full matrix and command builder.
                </p>
              </div>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                settingsCertificationEvidencePacket.status === 'evidence-complete'
                  ? 'bg-emerald-50 text-emerald-700'
                  : settingsCertificationEvidencePacket.status === 'needs-runtime-inputs'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-700',
              )}>
                {settingsCertificationEvidencePacket.status}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {settingsCertificationReadinessItems.map((item) => (
                <div key={item.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                  <div className="mt-1 break-words font-mono text-[11px] leading-4 text-foreground">{item.value}</div>
                  <div className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">{item.detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-md border border-border bg-muted/20 px-2 py-1">Secret boundary: no provider credential values are stored in Settings metadata.</span>
              <span className="rounded-md border border-border bg-muted/20 px-2 py-1">Artifact env: <span className="font-mono">{SETTINGS_PROVIDER_CERTIFICATION_OUTPUT_ENV}</span></span>
            </div>
          </div>
          <details className="mt-4 rounded-lg border border-border bg-muted/10 p-3" data-testid="settings-provider-certification-details" data-default-collapsed="true">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
              <div>
                <div className="text-sm font-semibold text-foreground">Provider matrix, secret families, and command builder</div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                  Expand when you are actively certifying live provider paths. The readiness summary above stays visible for daily Settings work.
                </p>
              </div>
              <span className="rounded bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {providerRuntimeEvidenceReadyCount}/{providerRuntimeEvidenceRows.length} runtime ready
              </span>
            </summary>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {[
              'certify_settings_providers -> npm run ci:settings-provider-certification',
              'certify_commerce_providers -> npm run ci:commerce-provider-certification',
              'certify_storage -> live storage provisioning diagnostics',
              'certify_rotation -> replacement storage credential validation',
              'certify_vercel_secrets -> Vercel env secret-manager dry-run planning',
              'certify_notification -> configured notification delivery diagnostics',
            ].map((item) => (
              <div key={item} className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
          <details className="mt-4 rounded-lg border border-border bg-muted/10 p-3" data-testid="settings-provider-certification-required-secret-families">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Required secret families</summary>
            <p className="mt-2 text-sm text-muted-foreground">
              Required secret families include <span className="font-mono">BACKY_DATABASE_URL</span>/<span className="font-mono">DATABASE_URL</span>, public API origin configuration through <span className="font-mono">BACKY_CORS_ALLOWED_ORIGINS</span>, storage aliases such as <span className="font-mono">BACKY_STORAGE_PROVIDER</span>/<span className="font-mono">BACKY_MEDIA_STORAGE_PROVIDER</span>, <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>, and <span className="font-mono">AWS_ACCESS_KEY_ID</span>, <span className="font-mono">VERCEL_TOKEN</span>/<span className="font-mono">BACKY_VERCEL_TOKEN</span> with project metadata, notification aliases such as <span className="font-mono">RESEND_API_KEY</span>, <span className="font-mono">SMTP_HOST</span>, <span className="font-mono">SMTP_USER</span>, <span className="font-mono">SMTP_PASSWORD</span>, and <span className="font-mono">BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL</span>, commerce aliases such as <span className="font-mono">STRIPE_SECRET_KEY</span>, <span className="font-mono">TAXJAR_API_KEY</span>, <span className="font-mono">PAYPAL_ACCESS_TOKEN</span>, <span className="font-mono">SHOPIFY_ADMIN_ACCESS_TOKEN</span>, and <span className="font-mono">COMMERCE_WEBHOOK_SECRET</span> for Stripe, TaxJar, Avalara, EasyPost, Shippo, PayPal, Paddle, Square, Adyen, Mollie, Razorpay, Shopify, BigCommerce, WooCommerce, Etsy, and Magento, plus HTTP endpoint aliases such as <span className="font-mono">COMMERCE_TAX_PROVIDER_URL</span>, <span className="font-mono">COMMERCE_SHIPPING_PROVIDER_URL</span>, <span className="font-mono">COMMERCE_DISCOUNT_PROVIDER_URL</span>, <span className="font-mono">COMMERCE_PRODUCT_SYNC_URL</span>, and <span className="font-mono">COMMERCE_SUBSCRIPTION_ACTION_URL</span>.
            </p>
          </details>
          <div className="mt-4 rounded-lg border border-border bg-background p-3" data-testid="settings-provider-certification">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Provider certification matrix</div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                  Settings keeps provider secrets out of saved metadata. These rows show which live provider families still require credentialed certification before the Settings row can move from Partial to Ready.
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                External providers
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Schema', value: 'backy.settings-provider-certification-handoff.v1' },
                { label: 'Status', value: 'external-live-provider-gate' },
                { label: 'Local preflight', value: 'npm run test:settings-provider-certification-preflight-contract' },
                { label: 'Secret boundary', value: 'Provider credentials stay in deployment or CI environment variables' },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                  <div className="mt-1 break-words font-mono text-[11px] leading-4 text-foreground">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="settings-provider-runtime-evidence">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-foreground">Runtime provider evidence</div>
                  <div className="mt-1 text-muted-foreground">
                    {providerRuntimeEvidenceReadyCount}/{providerRuntimeEvidenceRows.length} ready for local runtime checks before live provider certification.
                  </div>
                </div>
                <span className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-semibold',
                  providerRuntimeEvidenceReadyCount === providerRuntimeEvidenceRows.length ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}
                >
                  {providerRuntimeEvidenceReadyCount === providerRuntimeEvidenceRows.length ? 'Ready to certify' : 'Needs runtime inputs'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {providerRuntimeEvidenceRows.map((row) => (
                  <div key={row.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground">{row.label}</div>
                        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{row.detail}</div>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        row.ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                      )}
                      >
                        {row.status}
                      </span>
                    </div>
                    {row.missing.length > 0 && (
                      <div className="mt-2 break-words font-mono text-[10px] leading-4 text-muted-foreground">
                        Missing: {row.missing.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                Runtime evidence is non-secret and mirrors the Settings admin API providerCertification.runtimeEvidence block; credential values stay in server or CI environment variables.
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="settings-provider-certification-evidence">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">Provider certification evidence</div>
                  <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                    Tracks the non-secret Settings provider scenarios operators must prove before treating live infrastructure as certified.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    {providerCertificationScenarioEvidence.schemaVersion}
                  </span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    providerCertificationScenarioEvidence.status === 'ready'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700',
                  )}>
                    {providerCertificationScenarioEvidence.coverage.covered}/{providerCertificationScenarioEvidence.coverage.total} scenarios
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground">
                {providerCertificationScenarioEvidence.requiredGate}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {providerCertificationScenarioEvidence.scenarios.map((scenario) => (
                  <div key={scenario.key} className="rounded-md border border-border bg-card px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-foreground">{scenario.label}</div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        scenario.status === 'covered' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                      )}>
                        {scenario.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {scenario.evidenceCount} evidence item{scenario.evidenceCount === 1 ? '' : 's'}
                    </div>
                    {scenario.status === 'missing' ? (
                      <div className="mt-1 text-[11px] text-foreground">{scenario.nextAction}</div>
                    ) : null}
                    <div className="mt-1 break-words text-[11px] text-muted-foreground">
                      Expected: {scenario.expectedEvidence.join(' | ')}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {providerCertificationScenarioEvidence.secretHandling}
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="settings-provider-certification-evidence-packet">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">Certification evidence packet</div>
                  <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                    Redacted operator attachment manifest for selected Settings provider families, required aliases, capture sources, scenario attachments, and live-run redaction rules.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    {settingsCertificationEvidencePacket.schemaVersion}
                  </span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    settingsCertificationEvidencePacket.status === 'evidence-complete'
                      ? 'bg-emerald-50 text-emerald-700'
                      : settingsCertificationEvidencePacket.status === 'needs-runtime-inputs'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-700',
                  )}>
                    {settingsCertificationEvidencePacket.status}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={providerCertificationControlsDisabled || settingsCertificationEvidencePacket.selectedFamilies.length === 0}
                    title={providerCertificationControlsTitle || (settingsCertificationEvidencePacket.selectedFamilies.length === 0 ? 'Select at least one provider family' : undefined)}
                    onClick={() => void copySettingsProviderCertificationEvidencePacket()}
                    iconStart={copiedCertificationEvidencePacket ? <Check className="size-4" /> : <Copy className="size-4" />}
                    data-testid="settings-provider-certification-evidence-packet-copy-button"
                  >
                    {copiedCertificationEvidencePacket ? 'Copied evidence packet' : 'Copy evidence packet'}
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected families</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{settingsCertificationEvidencePacket.selectedFamilies.length}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {settingsCertificationEvidencePacket.selectedFamilies.length > 0 ? settingsCertificationEvidencePacket.selectedFamilies.map((family) => (
                      <span key={family} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {family}
                      </span>
                    )) : (
                      <span className="text-[11px] text-muted-foreground">No families selected</span>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Runtime gaps</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{settingsCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.length}</div>
                  <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {settingsCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.length > 0
                      ? settingsCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.join(', ')
                      : 'Selected families have runtime readiness evidence.'}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scenario attachments</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {settingsCertificationEvidencePacket.scenarioAttachments.filter((scenario) => scenario.status === 'covered').length}/{settingsCertificationEvidencePacket.scenarioAttachments.length}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {settingsCertificationEvidencePacket.redactionPolicy.allowedEvidence.slice(0, 3).join(' | ')}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {settingsCertificationEvidencePacket.operatorArtifacts.map((artifact) => (
                  <div key={artifact.key} className="rounded-md border border-border bg-card px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-foreground">{artifact.family}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{artifact.providerAlias} · {artifact.captureSource}</div>
                      </div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        artifact.status === 'ready-to-run' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                      )}>
                        {artifact.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {artifact.expectedArtifacts.map((expectedArtifact) => (
                        <span key={`${artifact.key}-${expectedArtifact}`} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {expectedArtifact}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scenario attachments</div>
                <div className="mt-2 grid gap-1 md:grid-cols-2 xl:grid-cols-4">
                  {settingsCertificationEvidencePacket.scenarioAttachments.map((scenario) => (
                    <div key={scenario.key} className="rounded bg-background px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{scenario.label}</span>
                        <span className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          scenario.status === 'covered' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                        )}>
                          {scenario.evidenceCount}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {settingsCertificationEvidencePacket.secretHandling}
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border bg-muted/10 p-3" data-testid="settings-provider-certification-command-builder">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Certification command builder</div>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                    Select the provider families for this run; the command keeps credentials in CI or shell environment variables and only writes non-secret aliases here.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={providerCertificationControlsDisabled || !settingsCertificationHasSelectedFamily}
                    title={providerCertificationControlsTitle || (!settingsCertificationHasSelectedFamily ? 'Select at least one provider family' : undefined)}
                    onClick={() => void copySettingsProviderCertificationEnvTemplate()}
                    iconStart={copiedCertificationEnvTemplate ? <Check className="size-4" /> : <Copy className="size-4" />}
                    data-testid="settings-provider-certification-env-copy-button"
                  >
                    {copiedCertificationEnvTemplate ? 'Copied env template' : 'Copy env template'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={providerCertificationControlsDisabled || !settingsCertificationHasSelectedFamily}
                    title={providerCertificationControlsTitle || (!settingsCertificationHasSelectedFamily ? 'Select at least one provider family' : undefined)}
                    onClick={() => void copySettingsProviderCertificationCommand()}
                    iconStart={copiedCertificationCommand ? <Check className="size-4" /> : <Copy className="size-4" />}
                    data-testid="settings-provider-certification-command-copy-button"
                  >
                    {copiedCertificationCommand ? 'Copied command' : 'Copy command'}
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                {([
                  {
                    key: 'includeReleaseDoctor',
                    label: 'Release doctor',
                    env: 'npm run doctor:release-certification',
                    testId: 'settings-provider-certification-doctor-toggle',
                  },
                  {
                    key: 'certifyStorage',
                    label: 'Storage provisioning',
                    env: 'BACKY_SETTINGS_CERTIFY_STORAGE',
                    testId: 'settings-provider-certification-storage-toggle',
                  },
                  {
                    key: 'certifyRotation',
                    label: 'Credential rotation',
                    env: 'BACKY_SETTINGS_CERTIFY_ROTATION',
                    testId: 'settings-provider-certification-rotation-toggle',
                  },
                  {
                    key: 'certifyVercelSecrets',
                    label: 'Vercel secrets',
                    env: 'BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS',
                    testId: 'settings-provider-certification-vercel-toggle',
                  },
                  {
                    key: 'certifyNotification',
                    label: 'Notifications',
                    env: 'BACKY_SETTINGS_CERTIFY_NOTIFICATION',
                    testId: 'settings-provider-certification-notification-toggle',
                  },
                  {
                    key: 'certifyPublicApiCors',
                    label: 'Custom frontend CORS',
                    env: 'BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS',
                    testId: 'settings-provider-certification-cors-toggle',
                  },
                  {
                    key: 'certifyCommerce',
                    label: 'Nested commerce',
                    env: 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
                    testId: 'settings-provider-certification-commerce-toggle',
                  },
                ] satisfies Array<{
                  key: 'includeReleaseDoctor' | 'certifyStorage' | 'certifyRotation' | 'certifyVercelSecrets' | 'certifyNotification' | 'certifyPublicApiCors' | 'certifyCommerce';
                  label: string;
                  env: string;
                  testId: string;
                }>).map((item) => (
                  <label key={item.key} className="flex min-h-[92px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={settingsCertificationCommandOptions[item.key]}
                      disabled={providerCertificationControlsDisabled}
                      onChange={(event) => updateSettingsCertificationCommandOptions({
                        [item.key]: event.target.checked,
                      } as Partial<SettingsCertificationCommandOptions>)}
                      className="mt-1 size-4 rounded border-border"
                      data-testid={item.testId}
                    />
                    <span>
                      <span className="block font-semibold text-foreground">{item.label}</span>
                      <span className="mt-1 block break-words font-mono text-[10px] leading-4 text-muted-foreground">{item.env}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
                <label className="text-xs">
                  <span className="font-semibold text-foreground">Storage provider</span>
                  <select
                    value={settingsCertificationCommandOptions.storageProvider}
                    disabled={providerCertificationControlsDisabled || (!settingsCertificationCommandOptions.certifyStorage && !settingsCertificationCommandOptions.certifyRotation)}
                    onChange={(event) => updateSettingsCertificationCommandOptions({
                      storageProvider: event.target.value as SettingsCertificationStorageProvider,
                    })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="settings-provider-certification-storage-provider-select"
                  >
                    {SETTINGS_CERTIFICATION_STORAGE_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    {SETTINGS_CERTIFICATION_STORAGE_PROVIDER_OPTIONS.find((option) => option.value === settingsCertificationCommandOptions.storageProvider)?.description}
                  </span>
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-foreground">Notification provider</span>
                  <select
                    value={settingsCertificationCommandOptions.notificationProvider}
                    disabled={providerCertificationControlsDisabled || !settingsCertificationCommandOptions.certifyNotification}
                    onChange={(event) => updateSettingsCertificationCommandOptions({
                      notificationProvider: event.target.value as SettingsCertificationNotificationProvider,
                    })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="settings-provider-certification-notification-provider-select"
                  >
                    {SETTINGS_CERTIFICATION_NOTIFICATION_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    {SETTINGS_CERTIFICATION_NOTIFICATION_PROVIDER_OPTIONS.find((option) => option.value === settingsCertificationCommandOptions.notificationProvider)?.description}
                  </span>
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-foreground">Certification site id</span>
                  <input
                    type="text"
                    value={settingsCertificationCommandOptions.siteId}
                    disabled={providerCertificationControlsDisabled}
                    onChange={(event) => updateSettingsCertificationCommandOptions({ siteId: event.target.value })}
                    placeholder="site-demo"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="settings-provider-certification-site-id-input"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Sets BACKY_SETTINGS_CERTIFY_SITE_ID and nested BACKY_COMMERCE_CERTIFY_SITE_ID.</span>
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-foreground">External target URL</span>
                  <input
                    type="url"
                    value={settingsCertificationCommandOptions.externalBaseUrl}
                    disabled={providerCertificationControlsDisabled}
                    onChange={(event) => updateSettingsCertificationCommandOptions({ externalBaseUrl: event.target.value })}
                    placeholder="https://backy.example.com"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="settings-provider-certification-external-target-input"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Blank starts a local disposable target.</span>
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-foreground">Expected frontend origin</span>
                  <input
                    type="url"
                    value={settingsCertificationCommandOptions.publicApiOrigin}
                    disabled={providerCertificationControlsDisabled || !settingsCertificationCommandOptions.certifyPublicApiCors}
                    onChange={(event) => updateSettingsCertificationCommandOptions({ publicApiOrigin: event.target.value })}
                    placeholder="https://app.example.com"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="settings-provider-certification-public-api-origin-input"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Sets BACKY_CORS_ALLOWED_ORIGINS for exact custom frontend API certification.</span>
                </label>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="text-xs">
                    <span className="font-semibold text-foreground">Vercel project id</span>
                    <input
                      type="text"
                      value={settingsCertificationCommandOptions.vercelProjectId}
                      disabled={providerCertificationControlsDisabled || !settingsCertificationCommandOptions.certifyVercelSecrets}
                      onChange={(event) => updateSettingsCertificationCommandOptions({ vercelProjectId: event.target.value })}
                      placeholder="prj_..."
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      data-testid="settings-provider-certification-vercel-project-input"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="font-semibold text-foreground">Vercel team id</span>
                    <input
                      type="text"
                      value={settingsCertificationCommandOptions.vercelTeamId}
                      disabled={providerCertificationControlsDisabled || !settingsCertificationCommandOptions.certifyVercelSecrets}
                      onChange={(event) => updateSettingsCertificationCommandOptions({ vercelTeamId: event.target.value })}
                      placeholder="team_..."
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      data-testid="settings-provider-certification-vercel-team-input"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="settings-provider-certification-env-template">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Env template</div>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      Copy this into CI secrets or a local shell env file, then replace placeholders with live provider credentials before running the guarded command.
                    </p>
                  </div>
                  <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    backy.settings-provider-certification-env-template.v1
                  </span>
                </div>
                <pre
                  className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-5 text-foreground"
                  data-testid="settings-provider-certification-env-template-body"
                >
                  {settingsCertificationEnvTemplate}
                </pre>
              </div>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-foreground p-3 text-[11px] leading-5 text-background" data-testid="settings-provider-certification-command">
                <code>{settingsCertificationCommand}</code>
              </pre>
              <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="settings-provider-certification-required-aliases">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required aliases for selected run</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {settingsCertificationRequiredAliases.map((alias) => (
                    <span key={alias} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {SETTINGS_PROVIDER_CERTIFICATION_GROUPS.map((group) => (
                <div key={group.family} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-foreground">{group.family}</div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {group.gate.includes('commerce') ? 'Commerce' : 'Settings'}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground">{group.gate}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.providers.map((provider) => (
                      <span key={`${group.family}-${provider}`} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                        {provider}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 rounded-md border border-border bg-background px-2 py-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required inputs</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {group.requiredInputs.map((input) => (
                        <span key={`${group.family}-${input}`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {input}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] leading-4 text-muted-foreground">{group.evidence}</div>
                </div>
              ))}
            </div>
          </div>
          </details>
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="Infrastructure check"
          description="Validate the saved/draft provider metadata against runtime capability before relying on Supabase, storage, or Vercel deployment workflows."
          icon={<CheckCircle2 className="size-4" />}
          action={
            <Button size="sm" disabled={disabled || isCheckingInfrastructure} onClick={() => void runInfrastructureCheck()}>
              {isCheckingInfrastructure ? 'Checking...' : 'Run infrastructure check'}
            </Button>
          }
        />
        <PanelContent>
          {infrastructureCheckError && (
            <Notice tone="warning" title="Infrastructure check failed">
              {infrastructureCheckError}
            </Notice>
          )}
          {!infrastructureDiagnostics && !infrastructureCheckError && (
            <EmptyState
              icon={CheckCircle2}
              title="No infrastructure check has run yet"
              description="Run a check after editing provider metadata to see which runtime pieces are ready, optional, or blocked."
            />
          )}
          {infrastructureDiagnostics && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Infrastructure check results</h4>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {infrastructureDiagnostics.filter((item) => item.status === 'blocked').length} blocked
                </span>
              </div>
              <div className="grid gap-3 xl:grid-cols-4">
                {infrastructureDiagnostics.map((diagnostic) => (
                  <div key={diagnostic.area} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{diagnostic.label}</div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{diagnostic.summary}</p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                        diagnostic.status === 'ready' && 'bg-emerald-50 text-emerald-700',
                        diagnostic.status === 'warning' && 'bg-amber-50 text-amber-700',
                        diagnostic.status === 'blocked' && 'bg-red-50 text-red-700',
                      )}
                      >
                        {diagnostic.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {diagnostic.checks.map((check) => (
                        <div key={check.label} className="rounded-md border border-border bg-card px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">{check.label}</span>
                            <span className={cn(
                              'text-[11px] font-semibold',
                              check.ready ? 'text-emerald-700' : check.required ? 'text-red-700' : 'text-amber-700',
                            )}
                            >
                              {check.ready ? 'Ready' : check.required ? 'Required' : 'Optional'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="Storage provisioning probe"
          description="Run a real media-storage write, read, and cleanup probe before accepting production uploads or rotating provider credentials."
          icon={<Cloud className="size-4" />}
          action={
            <Button size="sm" disabled={storageDisabled || isRunningStorageProbe} onClick={() => void runStorageProvisioningProbe()}>
              {isRunningStorageProbe ? 'Running...' : 'Run storage probe'}
            </Button>
          }
        />
        <PanelContent>
          {storageProbeError && (
            <Notice tone="warning" title="Storage probe failed">
              {storageProbeError}
            </Notice>
          )}
          {!storageProvisioningResult && !storageProbeError && (
            <EmptyState
              icon={Cloud}
              title="No storage probe has run yet"
              description="Run the storage probe to write a temporary file to the configured media provider, read it back, then delete it after changing storage environment variables or bucket policy."
            />
          )}
          {storageProvisioningResult && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">{storageProvisioningResult.summary}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Provider: <span className="font-mono">{storageProvisioningResult.provider}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Probe path: <span className="font-mono">{storageProvisioningResult.probePath}</span>
                    </p>
                  </div>
                  <span className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                    storageProvisioningResult.status === 'ready'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700',
                  )}
                  >
                    {storageProvisioningResult.status}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {storageProvisioningResult.checks.map((check) => (
                    <div key={check.label} className="rounded-md border border-border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{check.label}</span>
                        <span className={check.ready ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-red-700'}>
                          {check.ready ? 'Ready' : 'Blocked'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                    </div>
                  ))}
                </div>
                {storageProvisioningResult.secretReferences && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3" data-testid="settings-storage-secret-references">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Secret references</h5>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                        storageProvisioningResult.secretReferences.status === 'ready'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700',
                      )}
                      >
                        {storageProvisioningResult.secretReferences.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {storageProvisioningResult.secretReferences.summary}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {storageProvisioningResult.secretReferences.checks.map((check) => (
                        <div key={check.label} className="rounded-md border border-border bg-background px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">{check.label}</span>
                            <span className={check.ready ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-red-700'}>
                              {check.ready ? 'Ready' : 'Missing'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="text-sm font-semibold">Credential rotation</h4>
                <div className="mt-3 grid gap-2">
                  {storageProvisioningResult.rotation.fields.map((field) => (
                    <div key={field.name} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <span className="font-mono">{field.name}</span>
                      <span className={field.detected ? 'font-semibold text-emerald-700' : field.required ? 'font-semibold text-red-700' : 'font-semibold text-amber-700'}>
                        {field.detected ? 'Detected' : field.required ? 'Required' : 'Optional'}
                      </span>
                    </div>
                  ))}
                </div>
                {storageProvisioningResult.rotation.nextSteps.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                    {storageProvisioningResult.rotation.nextSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={storageDisabled || isRunningStorageRotationProbe}
                    onClick={() => void runStorageRotationProbe()}
                  >
                    {isRunningStorageRotationProbe ? 'Checking...' : 'Run rotation probe'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={storageDisabled || isRunningStorageSecretManager}
                    onClick={() => void runStorageSecretManager('plan', true)}
                  >
                    Plan env sync
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={storageDisabled || isRunningStorageSecretManager}
                    onClick={() => void runStorageSecretManager('promote', false)}
                  >
                    Promote env
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={storageDisabled || isRunningStorageSecretManager}
                    onClick={() => void runStorageSecretManager('revoke-replacement', false)}
                  >
                    Revoke next env
                  </Button>
                </div>
                {storageRotationProbeError && (
                  <Notice tone="warning" className="mt-3" title="Rotation probe failed">
                    {storageRotationProbeError}
                  </Notice>
                )}
                {storageRotationProbeResult && (
                  <div className="mt-4 rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Rotation probe</h5>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{storageRotationProbeResult.summary}</p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                        storageRotationProbeResult.status === 'ready'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700',
                      )}
                      >
                        {storageRotationProbeResult.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {storageRotationProbeResult.checks.map((check) => (
                        <div key={check.label} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">{check.label}</span>
                            <span className={check.ready ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-red-700'}>
                              {check.ready ? 'Ready' : 'Blocked'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {storageSecretManagerError && (
                  <Notice tone="warning" className="mt-3" title="Secret manager failed">
                    {storageSecretManagerError}
                  </Notice>
                )}
                {storageSecretManagerResult && (
                  <div className="mt-4 rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Vercel env sync</h5>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{storageSecretManagerResult.summary}</p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                        storageSecretManagerResult.status === 'ready'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700',
                      )}
                      >
                        {storageSecretManagerResult.executed ? 'executed' : storageSecretManagerResult.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {storageSecretManagerResult.operations.map((operation) => (
                        <div key={`${operation.action}-${operation.name}`} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs text-foreground">{operation.name}</span>
                            <span className={operation.ready ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-red-700'}>
                              {operation.executed ? 'Executed' : operation.ready ? operation.action : 'Blocked'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{operation.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="Media storage"
          description="Store the non-secret file-delivery intent that Media, page editors, product downloads, and custom frontends should follow."
          icon={<Database className="size-4" />}
          action={
            <Button size="sm" disabled={storageDisabled} onClick={useRuntimeStorage}>
              Use detected storage
            </Button>
          }
        />
        <PanelContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-sm font-semibold text-foreground">Storage behavior</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Backy keeps file metadata, folders, visibility, bindings, and transform contracts in-house. The provider below tells deployments where bytes should live.
              </p>
              <dl className="mt-3 grid gap-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Runtime provider</dt>
                  <dd className="font-mono">{runtimeStorage?.provider || 'not detected'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Runtime bucket</dt>
                  <dd className="max-w-[55%] truncate font-mono">{runtimeStorage?.bucket || 'not set'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Configured</dt>
                  <dd className={runtimeStorage?.configured ? 'text-success' : 'text-warning'}>
                    {runtimeStorage?.configured ? 'yes' : 'needs env'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Provider</span>
                <select
                  value={storage.provider || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ provider: event.target.value })}
                  className={inputClassName}
                >
                  <option value="">Choose provider</option>
                  <option value="local">Local development</option>
                  <option value="supabase">Supabase Storage</option>
                  <option value="s3">S3 compatible</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Bucket</span>
                <input
                  value={storage.bucket || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ bucket: event.target.value })}
                  placeholder="media"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="font-medium">Public base URL</span>
                <input
                  value={storage.publicBaseUrl || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ publicBaseUrl: event.target.value })}
                  placeholder="https://project-ref.supabase.co/storage/v1/object/public/media"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Path prefix</span>
                <input
                  value={storage.pathPrefix || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ pathPrefix: event.target.value })}
                  placeholder="sites/{siteId}"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Supabase key secret ref</span>
                <input
                  value={storage.supabaseKeySecretRef || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ supabaseKeySecretRef: event.target.value })}
                  placeholder="env:BACKY_SUPABASE_SERVICE_ROLE_KEY"
                  className={inputClassName}
                />
                <span className="text-xs text-muted-foreground">
                  Reference only; never paste the Supabase service role key.
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">S3 access key secret ref</span>
                <input
                  value={storage.accessKeyIdSecretRef || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ accessKeyIdSecretRef: event.target.value })}
                  placeholder="env:BACKY_S3_ACCESS_KEY_ID"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="font-medium">S3 secret access key ref</span>
                <input
                  value={storage.secretAccessKeySecretRef || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ secretAccessKeySecretRef: event.target.value })}
                  placeholder="env:BACKY_S3_SECRET_ACCESS_KEY"
                  className={inputClassName}
                />
                <span className="text-xs text-muted-foreground">
                  Storage credentials stay in deployment env or a connected secret store; Settings stores only these references.
                </span>
              </label>
              <div className="grid gap-2">
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(storage.privateFilesEnabled)}
                    disabled={storageDisabled}
                    onChange={(event) => updateStorage({ privateFilesEnabled: event.target.checked })}
                    className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  Private files
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={storage.imageTransformsEnabled !== false}
                    disabled={storageDisabled}
                    onChange={(event) => updateStorage({ imageTransformsEnabled: event.target.checked })}
                    className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  Image transforms
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Max upload size (MB)</span>
                <input
                  type="number"
                  min={1}
                  max={2048}
                  value={storage.maxFileSizeMb ?? ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ maxFileSizeMb: Number(event.target.value) })}
                  placeholder="25"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Workspace storage limit (GB)</span>
                <input
                  type="number"
                  min={1}
                  max={102400}
                  value={storage.workspaceStorageLimitGb ?? ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ workspaceStorageLimitGb: Number(event.target.value) })}
                  placeholder="10"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Storage warning threshold (%)</span>
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={storage.warningThresholdPercent ?? ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ warningThresholdPercent: Number(event.target.value) })}
                  placeholder="80"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Allowed file types</span>
                <input
                  value={storage.allowedFileTypes || ''}
                  disabled={storageDisabled}
                  onChange={(event) => updateStorage({ allowedFileTypes: event.target.value })}
                  placeholder="image/*,font/*,document/*,file/*"
                  className={inputClassName}
                />
                <span className="text-xs text-muted-foreground">
                  Comma-separated MIME types, extensions, or Backy media categories like image/*, font/*, document/*, and file/*.
                </span>
              </label>
            </div>
          </div>
          <div data-testid="settings-media-storage-handoff" className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Custom frontend media handoff</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  backy.media-storage-handoff.v1 packages storage policy, public media APIs, signed private delivery, folder organization, usage references, editable metadata, and design asset persistence for external builders.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={storageDisabled}
                title={storageDisabled ? providerCertificationControlsTitle : undefined}
                onClick={() => void copyMediaStorageHandoff()}
                data-testid="settings-media-storage-handoff-copy-button"
              >
                Copy media handoff
              </Button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <div className="text-[11px] font-medium text-muted-foreground">Provider</div>
                <div className="mt-1 truncate font-mono text-sm text-foreground">{settingsMediaStorageHandoff.provider.selected}</div>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <div className="text-[11px] font-medium text-muted-foreground">Bucket</div>
                <div className="mt-1 truncate font-mono text-sm text-foreground">{settingsMediaStorageHandoff.provider.bucket || 'not set'}</div>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <div className="text-[11px] font-medium text-muted-foreground">Private Files</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{settingsMediaStorageHandoff.policies.privateFilesEnabled ? 'enabled' : 'off'}</div>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <div className="text-[11px] font-medium text-muted-foreground">Transforms</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{settingsMediaStorageHandoff.policies.imageTransformsEnabled ? 'enabled' : 'off'}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)]">
              <div className="grid gap-2">
                <SettingsApiSnippet label="Public media list" value={settingsMediaStorageHandoff.endpointTemplates.publicMediaList} />
                <SettingsApiSnippet label="Admin upload" value={settingsMediaStorageHandoff.endpointTemplates.adminMediaUpload} />
                <SettingsApiSnippet label="Signed private URL" value={settingsMediaStorageHandoff.endpointTemplates.adminSignedUrl} />
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Contracts</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.values(settingsMediaStorageHandoff.contracts).map((contract) => (
                    <span key={contract} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {contract}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Design assets persist through {settingsMediaStorageHandoff.designStateUsage.preservedFields.length} media-aware fields without exposing provider credentials or signed URL tokens.
                </p>
              </div>
            </div>
            {mediaStorageHandoffNotice && (
              <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                {mediaStorageHandoffNotice}
              </div>
            )}
          </div>
          {runtimeStorage?.missing && runtimeStorage.missing.length > 0 && (
            <Notice tone="warning" className="mt-4">
              Missing storage env: {runtimeStorage.missing.join(', ')}
            </Notice>
          )}
        </PanelContent>
      </Panel>

      {runtimeDatabase?.error && (
        <Notice tone="warning" title="Database runtime issue">
          {runtimeDatabase.error}
        </Notice>
      )}

      <InfrastructureEnvContractPanel
        contracts={envContract}
        copiedProfile={copiedEnvProfile}
        disabled={disabled}
        onCopy={copyEnvTemplate}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Supabase"
            description="Use Supabase for Postgres persistence, storage, and auth-ready metadata."
            icon={<Cloud className="size-4" />}
            action={
              <Button size="sm" disabled={supabaseDisabled} onClick={useRuntimeSupabase}>
                Use detected env
              </Button>
            }
          />
          <PanelContent>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Project URL</span>
                <input
                  value={supabase.projectUrl || ''}
                  disabled={supabaseDisabled}
                  onChange={(event) => updateSupabase({ projectUrl: event.target.value })}
                  placeholder="https://project-ref.supabase.co"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Project ref</span>
                <input
                  value={supabase.projectRef || ''}
                  disabled={supabaseDisabled}
                  onChange={(event) => updateSupabase({ projectRef: event.target.value })}
                  placeholder="project-ref"
                  className={inputClassName}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['databaseEnabled', 'Database'],
                  ['storageEnabled', 'Storage'],
                  ['authEnabled', 'Auth'],
                ].map(([key, label]) => (
                  <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(supabase[key as keyof SupabaseSettings])}
                      disabled={supabaseDisabled}
                      onChange={(event) => updateSupabase({ [key]: event.target.checked } as Partial<SupabaseSettings>)}
                      className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {runtimeSupabase?.missing && runtimeSupabase.missing.length > 0 && (
                <Notice tone="warning">
                  Missing Supabase env: {runtimeSupabase.missing.join(', ')}
                </Notice>
              )}
            </div>
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader
            title="Vercel"
            description="Track deployment ownership for hosted Backy and future deploy workflows."
            icon={<Rocket className="size-4" />}
            action={
              <Button size="sm" disabled={vercelDisabled} onClick={useRuntimeVercel}>
                Use detected env
              </Button>
            }
          />
          <PanelContent>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Project ID</span>
                <input
                  value={vercel.projectId || ''}
                  disabled={vercelDisabled}
                  onChange={(event) => updateVercel({ projectId: event.target.value })}
                  placeholder="prj_..."
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Team slug</span>
                <input
                  value={vercel.teamSlug || ''}
                  disabled={vercelDisabled}
                  onChange={(event) => updateVercel({ teamSlug: event.target.value })}
                  placeholder="team-or-account"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Production domain</span>
                <input
                  value={vercel.productionDomain || ''}
                  disabled={vercelDisabled}
                  onChange={(event) => updateVercel({ productionDomain: event.target.value })}
                  placeholder="backy.example.com"
                  className={inputClassName}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(vercel.autoDeploy)}
                    disabled={vercelDisabled}
                    onChange={(event) => updateVercel({ autoDeploy: event.target.checked })}
                    className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  Auto deploy
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={vercel.previewDeployments !== false}
                    disabled={vercelDisabled}
                    onChange={(event) => updateVercel({ previewDeployments: event.target.checked })}
                    className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  Preview deploys
                </label>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="settings-deployment-history">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Deployment history</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Recent infrastructure checks record Vercel deployment readiness, domain metadata, and blocking configuration gaps.
                    </p>
                  </div>
                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {deploymentHistory.length} recorded
                  </span>
                </div>
                {deploymentHistory.length === 0 ? (
                  <div className="mt-3">
                    <EmptyState
                      icon={Rocket}
                      title="No deployment history yet"
                      description="Run an infrastructure check to record the first deployment and domain readiness snapshot."
                    />
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {deploymentHistory.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">
                            {formatAuditTime(entry.checkedAt)}
                          </span>
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                            entry.status === 'ready' && 'bg-emerald-50 text-emerald-700',
                            entry.status === 'warning' && 'bg-amber-50 text-amber-700',
                            entry.status === 'blocked' && 'bg-red-50 text-red-700',
                          )}
                          >
                            {entry.status}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <span>Project</span>
                            <span className="max-w-[60%] truncate font-mono text-foreground">{entry.projectId || 'not set'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Domain</span>
                            <span className="max-w-[60%] truncate font-mono text-foreground">{entry.productionDomain || 'not set'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Result</span>
                            <span className="font-medium text-foreground">
                              {entry.readyCount} ready / {entry.warningCount} warning / {entry.blockedCount} blocked
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {runtimeVercel?.missing && runtimeVercel.missing.length > 0 && (
                <Notice tone="warning">
                  Missing Vercel env: {runtimeVercel.missing.join(', ')}
                </Notice>
              )}
            </div>
          </PanelContent>
        </Panel>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="text-sm font-semibold">Backend milestones still visible from Settings</h4>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {PLATFORM_BACKLOG.map((item) => (
            <div key={item.item} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-xs font-semibold text-foreground">{item.item}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMMERCE SETTINGS
// ============================================

function CommerceSettings({
  value,
  onChange,
}: {
  value: CommerceSettingsConfig;
  onChange: (next: Partial<CommerceSettingsConfig>) => void;
}) {
  const resolved: Required<CommerceSettingsConfig> = {
    ...DEFAULT_COMMERCE_SETTINGS,
    ...value,
  };
  const update = (next: Partial<CommerceSettingsConfig>) => {
    onChange(next);
  };
  const updateToggle = (key: keyof Pick<
    CommerceSettingsConfig,
    'guestCheckout' | 'taxEnabled' | 'shippingEnabled' | 'discountsEnabled' | 'inventoryReservations' | 'webhookEventsEnabled'
  >, checked: boolean) => update({ [key]: checked } as Partial<CommerceSettingsConfig>);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <Panel>
        <PanelHeader
          title="Storefront checkout"
          description="Control how public product grids, carts, checkout handoff, and private order intake should behave for custom frontends."
          icon={<ShoppingCart className="size-4" />}
        />
        <PanelContent>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Commerce mode</span>
              <select
                value={resolved.mode}
                onChange={(event) => update({ mode: event.target.value as CommerceSettingsConfig['mode'] })}
                className={inputClassName}
              >
                <option value="catalog-only">Catalog only</option>
                <option value="manual-orders">Manual order capture</option>
                <option value="checkout-provider">Checkout provider</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Default currency</span>
              <input
                value={resolved.currency}
                onChange={(event) => update({ currency: event.target.value.toUpperCase().slice(0, 3) })}
                placeholder="USD"
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Payment provider</span>
              <select
                value={resolved.paymentProvider}
                onChange={(event) => update({ paymentProvider: event.target.value as CommerceSettingsConfig['paymentProvider'] })}
                className={inputClassName}
              >
                <option value="none">None yet</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="paddle">Paddle</option>
                <option value="square">Square</option>
                <option value="adyen">Adyen</option>
                <option value="mollie">Mollie</option>
                <option value="razorpay">Razorpay</option>
                <option value="manual">Manual / invoice</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Provider account ID</span>
              <input
                value={resolved.providerAccountId}
                onChange={(event) => update({ providerAccountId: event.target.value })}
                placeholder="acct_..."
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Provider mode</span>
              <select
                value={resolved.providerMode}
                onChange={(event) => update({ providerMode: event.target.value as CommerceSettingsConfig['providerMode'] })}
                className={inputClassName}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Provider webhook URL</span>
              <input
                value={resolved.providerWebhookUrl}
                onChange={(event) => update({ providerWebhookUrl: event.target.value })}
                placeholder="https://api.example.com/webhooks/commerce"
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Webhook secret reference</span>
              <input
                value={resolved.providerWebhookSecretId}
                onChange={(event) => update({ providerWebhookSecretId: event.target.value })}
                placeholder="env:STRIPE_WEBHOOK_SECRET"
                className={inputClassName}
              />
              <span className="text-xs text-muted-foreground">
                Store the provider signing secret in the runtime environment and save only an env variable reference here; raw provider signing secrets are rejected by Settings.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Webhook event allowlist</span>
              <input
                value={resolved.providerWebhookEvents}
                onChange={(event) => update({ providerWebhookEvents: event.target.value })}
                placeholder="checkout.session.completed,invoice.payment_succeeded,customer.subscription.paused,customer.subscription.resumed,customer.subscription.trial_will_end,customer.subscription.deleted,charge.refunded"
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reconciliation mode</span>
              <select
                value={resolved.reconciliationMode}
                onChange={(event) => update({ reconciliationMode: event.target.value as CommerceSettingsConfig['reconciliationMode'] })}
                className={inputClassName}
              >
                <option value="manual">Manual review</option>
                <option value="webhook">Provider webhooks</option>
                <option value="scheduled">Scheduled job</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reconciliation window</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={resolved.reconciliationWindowHours}
                  onChange={(event) => update({ reconciliationWindowHours: Number(event.target.value) })}
                  className={inputClassName}
                />
                <span className="shrink-0 text-xs text-muted-foreground">hours</span>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Success redirect path</span>
              <input
                value={resolved.checkoutSuccessPath}
                onChange={(event) => update({ checkoutSuccessPath: event.target.value })}
                placeholder="/checkout/success"
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Cancel redirect path</span>
              <input
                value={resolved.checkoutCancelPath}
                onChange={(event) => update({ checkoutCancelPath: event.target.value })}
                placeholder="/checkout/cancel"
                className={inputClassName}
              />
            </label>
          </div>

          {resolved.mode === 'checkout-provider' && resolved.paymentProvider === 'none' && (
            <Notice tone="warning" className="mt-4" title="Checkout provider needed">
              Select Stripe or manual payment handling before a custom frontend relies on provider checkout mode.
            </Notice>
          )}
          {resolved.webhookEventsEnabled && resolved.paymentProvider !== 'none' && !resolved.providerWebhookUrl && (
            <Notice tone="warning" className="mt-4" title="Webhook callback needed">
              Add the provider webhook URL before relying on automatic payment settlement or refund reconciliation.
            </Notice>
          )}
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="Commerce behavior"
          description="Feature flags that the product, cart, order-intake, and storefront APIs can expose to frontends."
        />
        <PanelContent>
          <div className="grid gap-3">
            {[
              ['guestCheckout', 'Guest checkout'],
              ['taxEnabled', 'Taxes'],
              ['shippingEnabled', 'Shipping'],
              ['discountsEnabled', 'Discounts'],
              ['inventoryReservations', 'Inventory reservations'],
              ['webhookEventsEnabled', 'Webhook events'],
            ].map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(resolved[key as keyof CommerceSettingsConfig])}
                  onChange={(event) => updateToggle(key as keyof Pick<
                    CommerceSettingsConfig,
                    'guestCheckout' | 'taxEnabled' | 'shippingEnabled' | 'discountsEnabled' | 'inventoryReservations' | 'webhookEventsEnabled'
                  >, event.target.checked)}
                  className="size-4 rounded border-input"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reservation window</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={resolved.reservationMinutes}
                  onChange={(event) => update({ reservationMinutes: Number(event.target.value) })}
                  className={inputClassName}
                />
                <span className="shrink-0 text-xs text-muted-foreground">minutes</span>
              </div>
            </label>
          </div>
          <div className="mt-5 grid gap-3 border-t border-border pt-4">
            <div>
              <h4 className="text-sm font-semibold">Pricing rules</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Non-secret defaults used by public order intake when calculating checkout quotes for custom frontends.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Standard tax rate</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={resolved.taxRatePercent}
                    onChange={(event) => update({ taxRatePercent: Number(event.target.value) })}
                    className={inputClassName}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">%</span>
                </div>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Digital tax rate</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={resolved.digitalTaxRatePercent}
                    onChange={(event) => update({ digitalTaxRatePercent: Number(event.target.value) })}
                    className={inputClassName}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">%</span>
                </div>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Shipping base</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={resolved.shippingBaseAmount}
                  onChange={(event) => update({ shippingBaseAmount: Number(event.target.value) })}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Shipping weight rate</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={resolved.shippingWeightRate}
                  onChange={(event) => update({ shippingWeightRate: Number(event.target.value) })}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium">Discount percent</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={resolved.discountPercent}
                    onChange={(event) => update({ discountPercent: Number(event.target.value) })}
                    className={inputClassName}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">%</span>
                </div>
              </label>
            </div>
            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              {([
                ['tax', 'Tax provider'],
                ['shipping', 'Shipping provider'],
                ['discount', 'Discount provider'],
              ] as const).map(([key, label]) => {
                const providerKey = `${key}Provider` as keyof CommerceSettingsConfig;
                const urlKey = `${key}ProviderUrl` as keyof CommerceSettingsConfig;
                const providerValue = String(resolved[providerKey] || 'manual');
                return (
                  <div key={key} className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium">{label}</span>
                      <select
                        value={providerValue}
                        onChange={(event) => update({ [providerKey]: event.target.value as 'manual' | 'http' | 'stripe' | 'taxjar' | 'avalara' | 'easypost' | 'shippo' } as Partial<CommerceSettingsConfig>)}
                        className={inputClassName}
                      >
                        <option value="manual">Built-in rules</option>
                        <option value="http">HTTP calculator</option>
                        {key === 'tax' ? <option value="stripe">Stripe Tax</option> : null}
                        {key === 'tax' ? <option value="taxjar">TaxJar</option> : null}
                        {key === 'tax' ? <option value="avalara">Avalara AvaTax</option> : null}
                        {key === 'shipping' ? <option value="easypost">EasyPost rates</option> : null}
                        {key === 'shipping' ? <option value="shippo">Shippo rates</option> : null}
                        {key === 'discount' ? <option value="stripe">Stripe promotion codes</option> : null}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium">{`${label.replace(' provider', '')} endpoint URL`}</span>
                      <input
                        value={String(resolved[urlKey] || '')}
                        onChange={(event) => update({ [urlKey]: event.target.value } as Partial<CommerceSettingsConfig>)}
                        placeholder={['stripe', 'taxjar', 'avalara', 'easypost', 'shippo'].includes(providerValue) ? 'Uses server env configuration' : `https://api.example.com/${key}-quote`}
                        disabled={['stripe', 'taxjar', 'avalara', 'easypost', 'shippo'].includes(providerValue)}
                        className={inputClassName}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Product catalog sync provider</span>
                <select
                  value={resolved.catalogSyncProvider || 'manual'}
                  onChange={(event) => update({ catalogSyncProvider: event.target.value as 'manual' | 'http' | 'generic-http' | 'custom-http' })}
                  className={inputClassName}
                >
                  <option value="manual">Manual / direct provider buttons</option>
                  <option value="http">HTTP catalog sync</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Catalog sync endpoint URL</span>
                <input
                  value={resolved.catalogSyncProviderUrl || ''}
                  onChange={(event) => update({ catalogSyncProviderUrl: event.target.value })}
                  placeholder="https://api.example.com/catalog/products"
                  className={inputClassName}
                />
              </label>
            </div>
            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Subscription lifecycle provider</span>
                <select
                  value={resolved.subscriptionActionProvider || 'manual'}
                  onChange={(event) => update({ subscriptionActionProvider: event.target.value as 'manual' | 'http' | 'generic-http' | 'custom-http' })}
                  className={inputClassName}
                >
                  <option value="manual">Native provider or manual handoff</option>
                  <option value="http">HTTP lifecycle adapter</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Subscription lifecycle endpoint URL</span>
                <input
                  value={resolved.subscriptionActionProviderUrl || ''}
                  onChange={(event) => update({ subscriptionActionProviderUrl: event.target.value })}
                  placeholder="https://api.example.com/subscription-actions"
                  className={inputClassName}
                />
              </label>
            </div>
            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Fulfillment dispatch provider</span>
                <select
                  value={resolved.fulfillmentProvider || 'manual'}
                  onChange={(event) => update({ fulfillmentProvider: event.target.value as 'manual' | 'http' })}
                  className={inputClassName}
                >
                  <option value="manual">Manual handoff</option>
                  <option value="http">HTTP warehouse/3PL</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Fulfillment endpoint URL</span>
                <input
                  value={resolved.fulfillmentProviderUrl || ''}
                  onChange={(event) => update({ fulfillmentProviderUrl: event.target.value })}
                  placeholder="https://api.example.com/fulfillment-dispatch"
                  className={inputClassName}
                />
              </label>
            </div>
            <div className="grid gap-3 border-t border-border pt-4">
              <div>
                <h4 className="text-sm font-semibold">Shipping label execution</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Optional carrier purchase defaults used by the Orders Prepare Label action when server credentials are configured.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Label provider</span>
                  <select
                    value={resolved.shippingLabelProvider || 'manual'}
                    onChange={(event) => update({ shippingLabelProvider: event.target.value as 'manual' | 'easypost' | 'shippo' })}
                    className={inputClassName}
                  >
                    <option value="manual">Manual handoff</option>
                    <option value="easypost">EasyPost</option>
                    <option value="shippo">Shippo</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Default carrier</span>
                  <input
                    value={resolved.shippingDefaultCarrier || ''}
                    onChange={(event) => update({ shippingDefaultCarrier: event.target.value })}
                    placeholder="UPS"
                    className={inputClassName}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Default service</span>
                  <input
                    value={resolved.shippingDefaultServiceLevel || ''}
                    onChange={(event) => update({ shippingDefaultServiceLevel: event.target.value })}
                    placeholder="Ground"
                    className={inputClassName}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Origin address JSON</span>
                  <textarea
                    value={resolved.shippingOriginAddress || ''}
                    onChange={(event) => update({ shippingOriginAddress: event.target.value })}
                    rows={3}
                    placeholder='{"name":"Warehouse","street1":"100 Fulfillment Way","city":"Austin","state":"TX","zip":"78701","country":"US"}'
                    className={`${inputClassName} resize-y font-mono text-xs`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Rate ID</span>
                  <input
                    value={resolved.shippingDefaultRateId || ''}
                    onChange={(event) => update({ shippingDefaultRateId: event.target.value })}
                    placeholder="rate_..."
                    className={inputClassName}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Default parcel JSON</span>
                <textarea
                  value={resolved.shippingDefaultParcel || ''}
                  onChange={(event) => update({ shippingDefaultParcel: event.target.value })}
                  rows={2}
                  placeholder='{"length":8,"width":6,"height":2,"weight":12}'
                  className={`${inputClassName} resize-y font-mono text-xs`}
                />
              </label>
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-border pt-4">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="size-4" />
                Platform billing limits
              </h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Non-secret plan and limit policy used by admin workflows before enabling new sites, products, seats, and order intake.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Billing plan</span>
                <select
                  value={resolved.billingPlan}
                  onChange={(event) => update({ billingPlan: event.target.value as CommerceSettingsConfig['billingPlan'] })}
                  className={inputClassName}
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Overage mode</span>
                <select
                  value={resolved.overageMode}
                  onChange={(event) => update({ overageMode: event.target.value as CommerceSettingsConfig['overageMode'] })}
                  className={inputClassName}
                >
                  <option value="warn">Warn only</option>
                  <option value="block">Block new usage</option>
                  <option value="manual-review">Manual review</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Monthly order limit</span>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={resolved.monthlyOrderLimit}
                  onChange={(event) => update({ monthlyOrderLimit: Number(event.target.value) })}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Product limit</span>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={resolved.productLimit}
                  onChange={(event) => update({ productLimit: Number(event.target.value) })}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Site limit</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={resolved.siteLimit}
                  onChange={(event) => update({ siteLimit: Number(event.target.value) })}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Team limit</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={resolved.teamLimit}
                  onChange={(event) => update({ teamLimit: Number(event.target.value) })}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Seat limit</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={resolved.seatLimit}
                  onChange={(event) => update({ seatLimit: Number(event.target.value) })}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium">Billing contact email</span>
                <input
                  type="email"
                  value={resolved.billingContactEmail}
                  onChange={(event) => update({ billingContactEmail: event.target.value })}
                  placeholder="billing@example.com"
                  className={inputClassName}
                />
              </label>
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelHeader
          title="Storefront API handoff"
          description="What frontend teams can safely read from Settings when building product grids, carts, and checkout pages."
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Catalog', 'Products stay public through the product catalog and collection record APIs.'],
              ['Checkout', 'The selected mode tells a custom frontend whether to show cart-only, manual order, or provider checkout flows.'],
              ['Settlement', `${resolved.reconciliationMode} reconciliation with a ${resolved.reconciliationWindowHours}-hour review window is part of the handoff contract.`],
              ['Billing policy', `${resolved.billingPlan} plan with ${resolved.monthlyOrderLimit} monthly orders and ${resolved.overageMode} overage handling.`],
              ['Private data', 'Orders, customer details, provider references, refunds, and fulfillment remain admin-only.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-border bg-card p-3">
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
              </div>
            ))}
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}

// ============================================
// NOTIFICATION SETTINGS
// ============================================

function NotificationSettings({
  value,
  onChange,
  delivery,
  deliveryLoading,
  webhookUrlError,
  onTestWebhook,
  onRetryWebhook,
  disabled,
}: {
  value: NotificationSettingsConfig;
  onChange: (next: Partial<NotificationSettingsConfig>) => void;
  delivery: SettingsNotificationWebhookDeliveryResult | null;
  deliveryLoading: boolean;
  webhookUrlError: string | null;
  onTestWebhook: () => void;
  onRetryWebhook: () => void;
  disabled: boolean;
}) {
  const updateEmail = (key: keyof NonNullable<NotificationSettingsConfig['email']>, checked: boolean) => {
    onChange({
      email: {
        [key]: checked,
      },
    });
  };
  const updateEmailRecipient = (recipient: string) => {
    onChange({
      email: {
        recipient,
      },
    });
  };

  const updateInApp = (key: keyof NonNullable<NotificationSettingsConfig['inApp']>, checked: boolean) => {
    onChange({
      inApp: {
        [key]: checked,
      },
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel>
        <PanelHeader
          title="Email notifications"
          description="Workspace events that should be sent to configured notification channels."
        />
        <PanelContent>
          <div className="grid gap-3">
            {[
              { key: 'comments' as const, label: 'Comment moderation events' },
              { key: 'newUser' as const, label: 'New user registration' },
              { key: 'pagePublished' as const, label: 'Page published' },
              { key: 'formSubmission' as const, label: 'New form submission' },
              { key: 'orderCreated' as const, label: 'New commerce order' },
              { key: 'productLowStock' as const, label: 'Product low stock' },
              { key: 'systemUpdates' as const, label: 'System updates' },
            ].map((item) => (
              <label key={item.key} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(value.email?.[item.key])}
                  disabled={disabled}
                  onChange={(event) => updateEmail(item.key, event.target.checked)}
                  className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Notification recipient</span>
              <input
                type="email"
                value={value.email?.recipient || ''}
                onChange={(event) => updateEmailRecipient(event.target.value)}
                placeholder="moderation@example.com"
                className={inputClassName}
              />
            </label>
          </div>
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="In-app notifications"
          description="Events shown in the dashboard notification bell."
        />
        <PanelContent>
          <div className="grid gap-3">
            {[
              { key: 'comments' as const, label: 'Pending comments' },
              { key: 'activity' as const, label: 'Team activity' },
              { key: 'mentions' as const, label: 'Team mentions' },
            ].map((item) => (
              <label key={item.key} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(value.inApp?.[item.key])}
                  disabled={disabled}
                  onChange={(event) => updateInApp(item.key, event.target.checked)}
                  className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            ))}
          </div>
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="Digest and webhook"
          description="Control active comment delivery cadence plus the comment webhook endpoint."
        />
        <PanelContent>
          <div className="grid gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Digest frequency</span>
              <select
                value={value.digestFrequency || 'instant'}
                onChange={(event) => onChange({ digestFrequency: event.target.value as NotificationSettingsConfig['digestFrequency'] })}
                className={inputClassName}
                disabled={disabled}
              >
                <option value="instant">Instant</option>
                <option value="daily">Daily digest</option>
                <option value="weekly">Weekly digest</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Webhook URL</span>
              <input
                value={value.webhookUrl || ''}
                onChange={(event) => onChange({ webhookUrl: event.target.value })}
                placeholder="https://example.com/backy-events"
                className={inputClassName}
                aria-invalid={Boolean(webhookUrlError)}
                aria-describedby={webhookUrlError ? 'settings-notification-webhook-url-error' : undefined}
                data-testid="settings-notification-webhook-url"
              />
              {webhookUrlError && (
                <span id="settings-notification-webhook-url-error" className="text-xs font-medium text-destructive" role="alert" data-testid="settings-notification-webhook-url-error">
                  {webhookUrlError}
                </span>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onTestWebhook}
                disabled={disabled || deliveryLoading}
                data-testid="settings-notification-webhook-test"
              >
                {deliveryLoading && !delivery?.retry ? 'Sending...' : 'Send test webhook'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRetryWebhook}
                disabled={disabled || deliveryLoading || !delivery?.requestId}
                data-testid="settings-notification-webhook-retry"
              >
                {deliveryLoading && delivery?.retry ? 'Retrying...' : 'Retry webhook'}
              </Button>
            </div>
            <div data-testid="settings-notification-webhook-result" className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              {delivery ? (
                <div className="grid gap-1">
                  <div className="font-medium text-foreground">
                    Last delivery: {delivery.status}
                  </div>
                  <div>
                    Request {delivery.requestId}
                    {delivery.statusCode ? ` / HTTP ${delivery.statusCode}` : ''}
                    {delivery.retry ? ' / retry' : ' / test'}
                  </div>
                  <div>{delivery.error || delivery.targetSummary || delivery.target}</div>
                </div>
              ) : (
                'Send a test event before relying on this endpoint for comment, commerce order, and workflow delivery.'
              )}
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Notice tone="info" title="Runtime behavior">
        Pending comment notifications in the header honor the in-app comments toggle immediately after settings are saved. Activity controls audit-based header notifications. Comment and commerce order emails plus workflow webhooks are recorded in delivery activity when a recipient or webhook URL is configured. The test controls execute the Settings webhook immediately and record test/retry audit events.
      </Notice>
    </div>
  );
}

// ============================================
// SECURITY SETTINGS
// ============================================

function SecuritySettings({
  publicApiKey,
  adminApiKey,
  authSettings,
  onAuthSettingsChange,
  onRegenerateKeys,
  onIssueAdminApiKey,
  onRevokeAdminApiKey,
  currentSession,
  onRotateCurrentSession,
  isRotatingSession,
  sessionRotationNotice,
  canManageApiKeys,
  canConfigureSettings,
  manageKeysPermissionTitle,
  configurePermissionTitle,
  auditLogs,
  isAuditLoading,
  auditNotice,
  canExportActivity,
  activityExportPermissionTitle,
  onRefreshAudit,
}: {
  publicApiKey: string;
  adminApiKey: string;
  authSettings?: SiteSettingsInput['auth'];
  onAuthSettingsChange: Dispatch<SetStateAction<SiteSettingsInput['auth']>>;
  onRegenerateKeys: (scope: 'all' | 'public' | 'admin') => Promise<void> | void;
  onIssueAdminApiKey: (label: string) => Promise<IssuedAdminApiKey | null>;
  onRevokeAdminApiKey: (keyId: string) => Promise<void> | void;
  currentSession: AdminSession | null;
  onRotateCurrentSession: () => Promise<void> | void;
  isRotatingSession: boolean;
  sessionRotationNotice: string | null;
  canManageApiKeys: boolean;
  canConfigureSettings: boolean;
  manageKeysPermissionTitle?: string;
  configurePermissionTitle?: string;
  auditLogs: AdminAuditLog[];
  isAuditLoading: boolean;
  auditNotice: string | null;
  canExportActivity: boolean;
  activityExportPermissionTitle?: string;
  onRefreshAudit: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<'public' | 'admin' | null>(null);
  const [serviceKeyLabel, setServiceKeyLabel] = useState('');
  const [serviceKeySubmitted, setServiceKeySubmitted] = useState(false);
  const [issuedServiceKey, setIssuedServiceKey] = useState<IssuedAdminApiKey | null>(null);
  const [copiedIssuedServiceKey, setCopiedIssuedServiceKey] = useState(false);
  const [issuingServiceKey, setIssuingServiceKey] = useState(false);
  const [revokingServiceKeyId, setRevokingServiceKeyId] = useState<string | null>(null);
  const [serviceKeyNotice, setServiceKeyNotice] = useState<string | null>(null);
  const [rotatingKey, setRotatingKey] = useState<'all' | 'public' | 'admin' | null>(null);
  const [pendingRotateKey, setPendingRotateKey] = useState<'all' | 'public' | 'admin' | null>(null);
  const policy: AuthPolicySettingsConfig = {
    ...DEFAULT_AUTH_SETTINGS,
    ...(authSettings || {}),
    requireTwoFactor: authSettings?.requireTwoFactor === true,
  };

  const updatePolicy = (next: Partial<AuthSettingsConfig>) => {
    if (!canConfigureSettings) return;
    onAuthSettingsChange((current) => ({
      ...DEFAULT_AUTH_SETTINGS,
      ...(current || {}),
      ...next,
    }));
  };

  const copyKey = async (scope: 'public' | 'admin', value: string) => {
    if (scope === 'admin' && !canManageApiKeys) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(scope);
      setTimeout(() => {
        setCopiedKey((current) => (current === scope ? null : current));
      }, 1200);
    } catch {
      setCopiedKey(null);
    }
  };

  const rotateKey = async (scope: 'all' | 'public' | 'admin') => {
    if (!canManageApiKeys) return;
    setRotatingKey(scope);
    try {
      await onRegenerateKeys(scope);
      setPendingRotateKey(null);
    } finally {
      setRotatingKey(null);
    }
  };

  const requestRotateKey = (scope: 'all' | 'public' | 'admin') => {
    if (!canManageApiKeys || rotatingKey !== null) return;
    setPendingRotateKey(scope);
  };

  const pendingRotateLabel = pendingRotateKey === 'all'
    ? 'both API keys'
    : pendingRotateKey === 'public'
      ? 'the public API key'
      : pendingRotateKey === 'admin'
        ? 'the admin API key'
        : '';
  const rotationHistory = authSettings?.apiKeyRotationHistory || [];
  const revocationHistory = authSettings?.apiKeyRevocationHistory || [];
  const serviceKeys = authSettings?.apiKeyServiceKeys || [];
  const activeServiceKeys = serviceKeys.filter((entry) => !entry.revokedAt && entry.status !== 'revoked');
  const currentSessionId = currentSession?.token ? currentSession.token.slice(-12) : null;
  const serviceKeyLabelInlineError = serviceKeySubmitted && serviceKeyLabel.trim().length === 0
    ? 'Add a label before issuing a key.'
    : null;
  const securityActionStatusId = 'settings-security-actions-status';
  const manageKeysDisabledReason = !canManageApiKeys
    ? manageKeysPermissionTitle || 'Requires settings.manageKeys permission'
    : null;
  const sessionRotateDisabledReason = !currentSession?.token
    ? 'No active admin session is available'
    : isRotatingSession
      ? 'Session rotation is already running'
      : null;
  const regenerateDisabledReason = manageKeysDisabledReason || (rotatingKey !== null
    ? 'API key regeneration is already running'
    : null);
  const issueServiceKeyDisabledReason = manageKeysDisabledReason || (issuingServiceKey
    ? 'Service key issuance is already running'
    : null);
  const revokeServiceKeyDisabledReason = manageKeysDisabledReason || (revokingServiceKeyId !== null
    ? 'A service key revocation is already running'
    : activeServiceKeys.length === 0
      ? 'No active service keys are available to revoke'
      : null);
  const actionStatus = (label: string, reason: string | null) => (
    `${label} ${reason ? `unavailable: ${reason}` : 'available'}.`
  );
  const securityActionStatus = [
    actionStatus('Rotate session', sessionRotateDisabledReason),
    actionStatus('Regenerate public API key', regenerateDisabledReason),
    actionStatus('Regenerate admin API key', regenerateDisabledReason),
    actionStatus('Regenerate all API keys', regenerateDisabledReason),
    actionStatus('Issue service key', issueServiceKeyDisabledReason),
    actionStatus('Revoke service keys', revokeServiceKeyDisabledReason),
  ].join(' ');

  const issueServiceKey = async () => {
    const label = serviceKeyLabel.trim();
    if (!canManageApiKeys || issuingServiceKey) return;
    setServiceKeySubmitted(true);
    if (!label) {
      setServiceKeyNotice('Add a label before issuing a key.');
      return;
    }

    setIssuingServiceKey(true);
    setServiceKeyNotice(null);
    try {
      const issued = await onIssueAdminApiKey(label);
      if (issued) {
        setIssuedServiceKey(issued);
        setServiceKeyLabel('');
        setServiceKeySubmitted(false);
        setServiceKeyNotice('Admin API key issued. Copy it now; Backy stores only a hash.');
      }
    } finally {
      setIssuingServiceKey(false);
    }
  };

  const revokeServiceKey = async (keyId: string) => {
    if (!canManageApiKeys || revokingServiceKeyId) return;

    setRevokingServiceKeyId(keyId);
    setServiceKeyNotice(null);
    try {
      await onRevokeAdminApiKey(keyId);
      setServiceKeyNotice('Admin API key revoked.');
    } finally {
      setRevokingServiceKeyId(null);
    }
  };

  const copyIssuedServiceKey = async () => {
    if (!issuedServiceKey?.adminApiKey) return;

    try {
      await navigator.clipboard.writeText(issuedServiceKey.adminApiKey);
      setCopiedIssuedServiceKey(true);
      setTimeout(() => setCopiedIssuedServiceKey(false), 1200);
    } catch {
      setCopiedIssuedServiceKey(false);
    }
  };

  return (
    <div
      className="space-y-6"
      role="group"
      aria-label="Security settings actions"
      aria-describedby={securityActionStatusId}
      data-testid="settings-security-action-group"
      data-action-status={securityActionStatus}
    >
      <span id={securityActionStatusId} className="sr-only" data-testid="settings-security-action-status">
        {securityActionStatus}
      </span>
      <Panel>
        <PanelHeader
          title="Workspace security policy"
          description="Persist enforced admin auth policy for sessions, invitations, and password rules."
        />
        <PanelContent>
          <div className="grid gap-4 xl:grid-cols-2">
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
              <span className="flex flex-col gap-1">
                <span>Require two-factor authentication</span>
                <span className="text-xs leading-4 text-muted-foreground">
                  Require a configured admin MFA code or TOTP secret after password verification.
                </span>
              </span>
              <input
                type="checkbox"
                checked={policy.requireTwoFactor}
                disabled={!canConfigureSettings}
                title={configurePermissionTitle}
                onChange={(event) => updatePolicy({ requireTwoFactor: event.target.checked })}
                className="size-4 rounded border-input"
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
              <span>Invite-only workspace access</span>
              <input
                type="checkbox"
                checked={policy.inviteOnly}
                disabled={!canConfigureSettings}
                title={configurePermissionTitle}
                onChange={(event) => updatePolicy({ inviteOnly: event.target.checked })}
                className="size-4 rounded border-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Minimum password length</span>
              <input
                type="number"
                min={8}
                max={128}
                value={policy.minPasswordLength}
                disabled={!canConfigureSettings}
                title={configurePermissionTitle}
                onChange={(event) => updatePolicy({ minPasswordLength: Number(event.target.value) })}
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Session timeout</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={15}
                  max={10080}
                  value={policy.sessionTimeoutMinutes}
                  disabled={!canConfigureSettings}
                  title={configurePermissionTitle}
                  onChange={(event) => updatePolicy({ sessionTimeoutMinutes: Number(event.target.value) })}
                  className={inputClassName}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm xl:col-span-2">
              <span className="font-medium">Allowed email domains</span>
              <input
                value={policy.allowedEmailDomains}
                disabled={!canConfigureSettings}
                title={configurePermissionTitle}
                onChange={(event) => updatePolicy({ allowedEmailDomains: event.target.value })}
                placeholder="example.com, agency.dev"
                className={inputClassName}
              />
              <span className="text-xs text-muted-foreground">
                Leave blank to allow any invited email domain.
              </span>
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/35 p-4" data-testid="settings-session-rotation">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Current admin session</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rotate the active browser token after sensitive work. Backy revokes the previous token and records the rotation in the auth audit trail.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onRotateCurrentSession()}
                disabled={Boolean(sessionRotateDisabledReason)}
                title={sessionRotateDisabledReason || undefined}
                aria-label="Rotate current admin session"
                aria-describedby={securityActionStatusId}
                iconStart={<RefreshCw className={cn('size-3.5', isRotatingSession && 'animate-spin')} />}
                data-testid="settings-session-rotate"
                data-action-state={sessionRotateDisabledReason ? 'blocked' : 'ready'}
                data-disabled-reason={sessionRotateDisabledReason || undefined}
              >
                {isRotatingSession ? 'Rotating...' : 'Rotate session'}
              </Button>
            </div>
            <dl className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <dt>Auth mode</dt>
                <dd className="mt-1 font-medium text-foreground">{currentSession?.authMode || 'No session'}</dd>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <dt>Session id</dt>
                <dd className="mt-1 font-mono text-foreground">{currentSessionId ? `...${currentSessionId}` : 'Not signed in'}</dd>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <dt>Issued</dt>
                <dd className="mt-1 text-foreground">{currentSession?.issuedAt ? formatAuditTime(currentSession.issuedAt) : 'n/a'}</dd>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <dt>Expires</dt>
                <dd className="mt-1 text-foreground">{currentSession?.expiresAt ? formatAuditTime(currentSession.expiresAt) : 'n/a'}</dd>
              </div>
            </dl>
            {sessionRotationNotice ? (
              <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                {sessionRotationNotice}
              </p>
            ) : null}
          </div>
        </PanelContent>
      </Panel>

      <div>
        <h3 className="text-lg font-semibold mb-4">API Keys</h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            {
              scope: 'public' as const,
              label: 'Public API Key',
              value: publicApiKey,
              detail: 'Use from custom frontends for published content, forms, comments, and media delivery.',
            },
            {
              scope: 'admin' as const,
              label: 'Admin API Key',
              value: adminApiKey,
              detail: 'Use only from trusted server environments for dashboard and management workflows.',
            },
          ].map((item) => {
            const canShowValue = item.scope !== 'admin' || canManageApiKeys;
            const displayValue = canShowValue
              ? item.value || 'Not configured'
              : 'Hidden without settings.manageKeys';
            const statusLabel = !canShowValue
              ? 'Hidden'
              : item.value
                ? 'Active'
                : 'Not configured';
            const statusClassName = statusLabel === 'Active'
              ? 'bg-success/10 text-success'
              : statusLabel === 'Hidden'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-muted text-muted-foreground';
            const copyDisabledReason = !item.value
              ? `${item.label} is not configured`
              : !canShowValue
                ? manageKeysDisabledReason || 'Admin API key is hidden without settings.manageKeys permission'
                : null;
            const regenerateKeyDisabledReason = regenerateDisabledReason;

            return (
            <div key={item.scope} className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClassName}`}
                  data-testid={`settings-api-key-status-${item.scope}`}
                >
                  {statusLabel}
                </span>
              </div>
              <p className="mt-3 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                {displayValue}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyKey(item.scope, item.value)}
                  disabled={Boolean(copyDisabledReason)}
                  title={copyDisabledReason || undefined}
                  aria-label={`Copy ${item.label}`}
                  aria-describedby={securityActionStatusId}
                  data-testid={`settings-api-key-copy-${item.scope}`}
                  data-action-state={copyDisabledReason ? 'blocked' : 'ready'}
                  data-disabled-reason={copyDisabledReason || undefined}
                >
                  {copiedKey === item.scope ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requestRotateKey(item.scope)}
                  disabled={Boolean(regenerateKeyDisabledReason)}
                  title={regenerateKeyDisabledReason || undefined}
                  aria-label={`Regenerate ${item.label}`}
                  aria-describedby={securityActionStatusId}
                  data-testid={`settings-api-key-regenerate-${item.scope}`}
                  data-action-state={regenerateKeyDisabledReason ? 'blocked' : 'ready'}
                  data-disabled-reason={regenerateKeyDisabledReason || undefined}
                >
                  {rotatingKey === item.scope ? 'Regenerating...' : `Regenerate ${item.scope}`}
                </Button>
              </div>
            </div>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Rotate both keys</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use this when a workspace credential may have been exposed. Existing integrations need to update both keys.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => requestRotateKey('all')}
              disabled={Boolean(regenerateDisabledReason)}
              title={regenerateDisabledReason || undefined}
              aria-label="Regenerate all API keys"
              aria-describedby={securityActionStatusId}
              data-testid="settings-api-key-regenerate-all"
              data-action-state={regenerateDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={regenerateDisabledReason || undefined}
            >
              {rotatingKey === 'all' ? 'Regenerating...' : 'Regenerate all keys'}
            </Button>
          </div>
          {!canManageApiKeys ? (
            <p className="mt-3 text-xs text-amber-700">
              API key regeneration is restricted to workspace owners.
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4" data-testid="settings-admin-service-keys">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Admin service keys</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Issue named server keys for trusted integrations and revoke them without rotating the primary admin key.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {activeServiceKeys.length} active
          </span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">New key label</span>
            <input
              value={serviceKeyLabel}
              maxLength={80}
              disabled={!canManageApiKeys || issuingServiceKey}
              title={manageKeysPermissionTitle}
              onChange={(event) => setServiceKeyLabel(event.target.value)}
              placeholder="Production frontend server"
              className={inputClassName}
              aria-invalid={Boolean(serviceKeyLabelInlineError)}
              aria-describedby={serviceKeyLabelInlineError ? 'settings-admin-service-key-label-error' : undefined}
              data-testid="settings-admin-service-key-label"
            />
            {serviceKeyLabelInlineError && (
              <span id="settings-admin-service-key-label-error" className="text-xs font-medium text-destructive" role="alert" data-testid="settings-admin-service-key-label-error">
                {serviceKeyLabelInlineError}
              </span>
            )}
          </label>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => void issueServiceKey()}
              disabled={Boolean(issueServiceKeyDisabledReason)}
              title={issueServiceKeyDisabledReason || undefined}
              aria-label="Issue admin service key"
              aria-describedby={securityActionStatusId}
              data-testid="settings-admin-service-key-issue"
              data-action-state={issueServiceKeyDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={issueServiceKeyDisabledReason || undefined}
            >
              {issuingServiceKey ? 'Issuing...' : 'Issue key'}
            </Button>
          </div>
        </div>
        {issuedServiceKey ? (
          <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm" data-testid="settings-admin-service-key-issued">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">Copy this key now</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Backy stores only the hash and fingerprint after this response.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyIssuedServiceKey()}
                disabled={!issuedServiceKey.adminApiKey}
                title={!issuedServiceKey.adminApiKey ? 'No one-time service key is available to copy' : undefined}
                aria-label="Copy issued admin service key"
                aria-describedby={securityActionStatusId}
                data-testid="settings-admin-service-key-issued-copy"
                data-action-state={issuedServiceKey.adminApiKey ? 'ready' : 'blocked'}
                data-disabled-reason={!issuedServiceKey.adminApiKey ? 'No one-time service key is available to copy' : undefined}
              >
                {copiedIssuedServiceKey ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-3 break-all rounded border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
              {issuedServiceKey.adminApiKey}
            </p>
          </div>
        ) : null}
        {serviceKeyNotice ? (
          <p className="mt-3 text-sm text-muted-foreground">{serviceKeyNotice}</p>
        ) : null}
        {serviceKeys.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Shield}
              title="No service keys have been issued yet"
              description="Issue a scoped admin service key when an automation or external backend needs non-owner access to Backy APIs."
            />
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {serviceKeys.slice(0, 10).map((entry) => {
              const revoked = Boolean(entry.revokedAt || entry.status === 'revoked');
              const revokeDisabledReason = manageKeysDisabledReason ||
                (revoked ? 'This service key is already revoked' : null) ||
                (revokingServiceKeyId !== null ? 'A service key revocation is already running' : null);
              return (
                <div key={entry.id} className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{entry.label}</p>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        revoked ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success',
                      )}>
                        {revoked ? 'Revoked' : 'Active'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {formatAuditTime(entry.createdAt)} by {entry.createdBy || 'system'}
                    </p>
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                      {entry.keyPrefix || 'sk_srv_...'} / {entry.keyFingerprint || 'fingerprint unavailable'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Scope {entry.permissionScope === 'non-owner-admin' || !entry.permissionScope
                        ? 'non-owner admin APIs'
                        : entry.permissionScope}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last used {entry.lastUsedAt ? formatAuditTime(entry.lastUsedAt) : 'never'}
                    </p>
                    {revoked ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Revoked {formatAuditTime(entry.revokedAt || '')} by {entry.revokedBy || 'system'}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void revokeServiceKey(entry.id)}
                      disabled={Boolean(revokeDisabledReason)}
                      title={revokeDisabledReason || undefined}
                      aria-label={`Revoke admin service key ${entry.label}`}
                      aria-describedby={securityActionStatusId}
                      data-testid={`settings-admin-service-key-revoke-${entry.id}`}
                      data-action-state={revokeDisabledReason ? 'blocked' : 'ready'}
                      data-disabled-reason={revokeDisabledReason || undefined}
                    >
                      {revokingServiceKeyId === entry.id ? 'Revoking...' : 'Revoke'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border p-4" data-testid="settings-api-key-rotation-history">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">API key rotation history</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Non-secret fingerprints, actor, request id, and scope for recent key rotations.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {rotationHistory.length} recorded
          </span>
        </div>
        {rotationHistory.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={History}
              title="No API key rotations have been recorded yet"
              description="Rotate public or admin API keys to populate this audit trail with non-secret fingerprints and actor details."
            />
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {rotationHistory.slice(0, 6).map((entry) => (
              <div key={entry.id} className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_1.5fr]">
                <div>
                  <p className="font-medium text-foreground">
                    {entry.scope === 'all' ? 'Public and admin keys' : `${entry.scope} key`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatAuditTime(entry.rotatedAt)} by {entry.actorId || 'system'}
                  </p>
                  {entry.requestId ? (
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                      {entry.requestId}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="font-medium text-foreground">Public</p>
                    <p className="mt-1">Changed: {entry.publicKeyChanged ? 'yes' : 'no'}</p>
                    <p className="mt-1 font-mono">Before {entry.previousPublicKeyFingerprint || 'n/a'}</p>
                    <p className="font-mono">After {entry.newPublicKeyFingerprint || 'n/a'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="font-medium text-foreground">Admin</p>
                    <p className="mt-1">Changed: {entry.adminKeyChanged ? 'yes' : 'no'}</p>
                    <p className="mt-1 font-mono">Before {entry.previousAdminKeyFingerprint || 'n/a'}</p>
                    <p className="font-mono">After {entry.newAdminKeyFingerprint || 'n/a'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border p-4" data-testid="settings-api-key-revocation-history">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">API key revocation history</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Fingerprints for replaced keys that are no longer accepted after rotation.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {revocationHistory.length} revoked
          </span>
        </div>
        {revocationHistory.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={History}
              title="No API keys have been revoked by rotation yet"
              description="Revoked fingerprints appear here after key rotation so operators can confirm replaced credentials are no longer accepted."
            />
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {revocationHistory.slice(0, 8).map((entry) => (
              <div key={entry.id} className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_1.5fr]">
                <div>
                  <p className="font-medium text-foreground">
                    {entry.keyType} key revoked
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatAuditTime(entry.revokedAt)} by {entry.actorId || 'system'}
                  </p>
                  {entry.requestId ? (
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                      {entry.requestId}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="font-medium text-foreground">Revoked fingerprint</p>
                    <p className="mt-1 font-mono">{entry.revokedKeyFingerprint || 'n/a'}</p>
                    <p className="mt-2">Reason: {entry.reason || 'rotated'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="font-medium text-foreground">Replacement fingerprint</p>
                    <p className="mt-1 font-mono">{entry.replacementKeyFingerprint || 'n/a'}</p>
                    <p className="mt-2">Scope: {entry.scope}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingRotateKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" data-testid="settings-api-key-rotation-confirm-dialog">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Regenerate {pendingRotateLabel}?</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Existing integrations using {pendingRotateLabel} will stop working until they are updated with the new value.
              This cannot be undone.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPendingRotateKey(null)}
                disabled={rotatingKey !== null}
                data-testid="settings-api-key-rotation-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void rotateKey(pendingRotateKey)}
                disabled={rotatingKey !== null}
                data-testid="settings-api-key-rotation-confirm"
              >
                {rotatingKey === pendingRotateKey ? 'Regenerating...' : 'Regenerate key'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AuditTrail
        logs={auditLogs}
        isLoading={isAuditLoading}
        notice={auditNotice}
        disabled={!canExportActivity}
        disabledTitle={activityExportPermissionTitle}
        onRefresh={onRefreshAudit}
      />
    </div>
  );
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const textFromRecord = (value: Record<string, unknown> | undefined, key: string): string | null => {
  const raw = value?.[key];
  return typeof raw === 'string' && raw.trim() ? raw : null;
};

type AuditTrailFilter = 'all' | 'auth' | 'api-keys' | 'settings';

const AUDIT_FILTER_OPTIONS: Array<{ value: AuditTrailFilter; label: string }> = [
  { value: 'all', label: 'All events' },
  { value: 'auth', label: 'Auth events' },
  { value: 'api-keys', label: 'API key events' },
  { value: 'settings', label: 'Settings changes' },
];

const auditTrailCategory = (log: AdminAuditLog): Exclude<AuditTrailFilter, 'all'> | 'other' => {
  if (log.action.startsWith('auth.')) return 'auth';
  if (log.action.startsWith('settings.api_keys')) return 'api-keys';
  if (log.action === 'settings.update') return 'settings';
  return 'other';
};

const auditDetailPayload = (log: AdminAuditLog) => JSON.stringify({
  id: log.id,
  action: log.action,
  actorId: log.actorId,
  entity: log.entity,
  entityId: log.entityId,
  requestId: log.requestId,
  metadata: log.metadata || {},
  before: log.before || null,
  after: log.after || null,
}, null, 2);

function formatAuditTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function auditTitle(log: AdminAuditLog): string {
  if (log.action === 'auth.login.success') {
    return 'Admin login accepted';
  }
  if (log.action === 'auth.login.mfa_required') {
    return 'Admin login paused for MFA';
  }
  if (log.action === 'auth.login.mfa_invalid') {
    return 'Admin MFA rejected';
  }
  if (log.action === 'auth.login.mfa_provider_missing') {
    return 'Admin MFA provider missing';
  }
  if (log.action === 'auth.logout') {
    return 'Admin logged out';
  }
  if (log.action === 'auth.session.rotate') {
    return 'Admin session rotated';
  }
  if (log.action === 'auth.session.revoke') {
    return 'Admin session revoked';
  }
  if (log.action === 'settings.update') {
    return 'Settings updated';
  }
  if (log.action === 'site.settings.updated') {
    return 'Site settings updated';
  }
  if (log.action === 'settings.api_keys.regenerate') {
    return 'API keys regenerated';
  }
  return log.action;
}

function auditDescription(log: AdminAuditLog): string {
  const beforeMode = textFromRecord(log.before, 'deliveryMode');
  const afterMode = textFromRecord(log.after, 'deliveryMode');
  const metadata = asRecord(log.metadata);
  const changedKeys = Array.isArray(metadata?.changedKeys)
    ? metadata.changedKeys.filter((key): key is string => typeof key === 'string')
    : [];
  const scope = typeof metadata?.scope === 'string' ? metadata.scope : null;
  const email = typeof metadata?.email === 'string' ? metadata.email : null;
  const targetEmail = typeof metadata?.targetEmail === 'string' ? metadata.targetEmail : null;
  const authMode = typeof metadata?.authMode === 'string' ? metadata.authMode : null;
  const targetAuthMode = typeof metadata?.targetAuthMode === 'string' ? metadata.targetAuthMode : null;
  const previousSessionId = typeof metadata?.previousSessionId === 'string' ? metadata.previousSessionId : null;
  const newSessionId = typeof metadata?.newSessionId === 'string' ? metadata.newSessionId : null;

  if (beforeMode && afterMode && beforeMode !== afterMode) {
    return `Delivery mode changed from ${beforeMode} to ${afterMode}.`;
  }

  if (log.action === 'auth.login.success') {
    return `${email || 'Admin'} signed in${authMode ? ` with ${authMode}` : ''}.`;
  }

  if (log.action === 'auth.login.mfa_required') {
    return `${email || 'Admin'} passed primary auth and must enter a two-factor code.`;
  }

  if (log.action === 'auth.login.mfa_invalid') {
    return `${email || 'Admin'} entered an invalid two-factor code.`;
  }

  if (log.action === 'auth.login.mfa_provider_missing') {
    return 'Two-factor auth is required but no MFA verifier is configured.';
  }

  if (log.action === 'auth.logout') {
    return `${email || 'Admin'} logged out${authMode ? ` from ${authMode}` : ''}.`;
  }

  if (log.action === 'auth.session.rotate') {
    return `${email || 'Admin'} rotated ${authMode || 'admin'} session${previousSessionId && newSessionId ? ` from ...${previousSessionId} to ...${newSessionId}` : ''}.`;
  }

  if (log.action === 'auth.session.revoke') {
    return `Revoked ${targetEmail || 'admin'} session${targetAuthMode ? ` (${targetAuthMode})` : ''}.`;
  }

  if (scope) {
    return `Regenerated ${scope === 'all' ? 'public and admin' : scope} API key${scope === 'all' ? 's' : ''}.`;
  }

  if (changedKeys.length > 0) {
    return `Changed ${changedKeys.join(', ')}.`;
  }

  return `Request ${log.requestId || log.id}`;
}

function AuditTrail({
  logs,
  isLoading,
  notice,
  disabled = false,
  disabledTitle,
  onRefresh,
}: {
  logs: AdminAuditLog[];
  isLoading: boolean;
  notice: string | null;
  disabled?: boolean;
  disabledTitle?: string;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<AuditTrailFilter>('all');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const filteredLogs = logs.filter((log) => (
    filter === 'all' ? true : auditTrailCategory(log) === filter
  ));
  const selectedLog = selectedLogId
    ? filteredLogs.find((log) => log.id === selectedLogId) || null
    : null;

  return (
    <div className="rounded-xl border border-border p-4" data-testid="settings-audit-trail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-foreground" />
            <h3 className="text-lg font-semibold">Settings Audit Trail</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Recent settings, API-key, and auth events recorded by the backend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Filter</span>
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as AuditTrailFilter);
                setSelectedLogId(null);
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              data-testid="settings-audit-filter"
            >
              {AUDIT_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || disabled}
            title={disabledTitle}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium',
              'hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4" data-testid="settings-audit-summary">
        {AUDIT_FILTER_OPTIONS.map((option) => {
          const count = option.value === 'all'
            ? logs.length
            : logs.filter((log) => auditTrailCategory(log) === option.value).length;
          return (
            <div key={option.value} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">{option.label}</p>
              <p className="mt-1 text-lg font-semibold">{count}</p>
            </div>
          );
        })}
      </div>

      {notice && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </div>
      )}

      <div className="mt-4 divide-y divide-border rounded-lg border border-border" data-testid="settings-audit-results">
        {isLoading && logs.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">
            Loading audit trail...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="px-4 py-5">
            <EmptyState
              icon={History}
              title="No matching settings audit events"
              description="Change the audit filter or perform a settings, provider, deployment, notification, or API-key action to populate this trail."
            />
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{auditTitle(log)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {auditDescription(log)}
                </p>
                {log.requestId && (
                  <p className="font-mono text-xs text-muted-foreground mt-2 break-all">
                    {log.requestId}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLogId((current) => (current === log.id ? null : log.id))}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                  data-testid="settings-audit-view-detail"
                >
                  {selectedLogId === log.id ? 'Hide detail' : 'View detail'}
                </button>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{formatAuditTime(log.createdAt)}</p>
                <p className="mt-1">{log.actorId || 'admin'}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedLog ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4" data-testid="settings-audit-detail">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Audit event detail</p>
              <p className="mt-1 text-sm text-muted-foreground">{auditTitle(selectedLog)}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedLogId(null)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
            {auditDetailPayload(selectedLog)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function SettingsApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

export default SettingsPage;
