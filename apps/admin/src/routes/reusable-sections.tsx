import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  GitBranch,
  History,
  Layers3,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { SiteSettings } from '@backy-cms/core';
import {
  createReusableSection,
  deleteReusableSection,
  exportReusableSections,
  getSiteFrontendDesign,
  getReusableSectionInstances,
  getReusableSectionMetadata,
  getUserPermissions,
  importReusableSections,
  listReusableSections,
  listReusableSectionVersions,
  refreshReusableSectionInstances,
  restoreReusableSectionVersion,
  updateReusableSectionMetadata,
  updateReusableSection,
  type AdminUserPermissionMatrix,
  type ReusableSection,
  type ReusableSectionContent,
  type ReusableSectionInput,
  type ReusableSectionInstancesReport,
  type ReusableSectionMetadata,
  type ReusableSectionVersions,
  type ReusableSectionExportEntry,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import { cn, formatDate } from '@/lib/utils';
import { normalizeSavedCanvasContent } from '@/components/editor/editorCatalog';
import type { CanvasElement, CanvasSize } from '@/types/editor';

type SectionStatusFilter = ReusableSection['status'] | 'all';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];
type ReusableSectionPermissionKey = 'pages.view' | 'pages.edit' | 'pages.delete';

const REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS: Record<ReusableSectionPermissionKey, Array<AuthUser['role']>> = {
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'pages.delete': ['owner', 'admin'],
};

interface ReusableSectionsSearch {
  siteId?: string;
  sectionId?: string;
  frontendTemplate?: string;
  status?: SectionStatusFilter;
  q?: string;
}

type ReusableSectionsSearchUpdate = Omit<Partial<ReusableSectionsSearch>, 'sectionId'> & {
  sectionId?: string | null;
};

interface SectionTemplateBlueprint {
  name: string;
  slug: string;
  description: string;
  category: string;
  status: ReusableSection['status'];
  tags: string[];
  content: ReusableSectionContent;
}

interface SectionMetadataDraft {
  displayName: string;
  summary: string;
  usageNotes: string;
  previewPath: string;
  labels: string;
}

const SECTION_STATUS_FILTERS: SectionStatusFilter[] = ['active', 'archived', 'all'];

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const isSectionStatusFilter = (value: unknown): value is SectionStatusFilter => (
  typeof value === 'string' && SECTION_STATUS_FILTERS.includes(value as SectionStatusFilter)
);

export const Route = createFileRoute('/reusable-sections')({
  validateSearch: (search: Record<string, unknown>): ReusableSectionsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    sectionId: normalizedSearchString(search.sectionId),
    frontendTemplate: normalizedSearchString(search.frontendTemplate),
    status: isSectionStatusFilter(search.status) ? search.status : undefined,
    q: normalizedSearchString(search.q),
  }),
  component: ReusableSectionsRoute,
});

const EMPTY_CONTENT: ReusableSectionContent = {
  canvasSize: { width: 1200, height: 520 },
  elements: [],
  customCSS: '',
  customJS: '',
};

const DEFAULT_SECTION_CANVAS_SIZE: CanvasSize = { width: 1200, height: 520 };

const makeElementId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeSlug = (value: string, fallback: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const optionalStringFromRecord = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const optionalStringListFromRecord = (record: Record<string, unknown> | undefined, key: string): string[] | undefined => {
  const value = record?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length > 0 ? Array.from(new Set(strings)) : undefined;
};

const stringOrEmpty = (value: unknown): string => (
  typeof value === 'string' ? value : ''
);

const metadataDraftFromLibrary = (metadata: ReusableSectionMetadata | null): SectionMetadataDraft => {
  const library = metadata?.library || {};
  return {
    displayName: stringOrEmpty(library.displayName),
    summary: stringOrEmpty(library.summary),
    usageNotes: stringOrEmpty(library.usageNotes),
    previewPath: stringOrEmpty(library.previewPath),
    labels: Array.isArray(library.labels) ? library.labels.filter((label): label is string => typeof label === 'string').join(', ') : '',
  };
};

const reusableSectionExportEntriesFromPayload = (payload: unknown): ReusableSectionExportEntry[] => {
  const root = isPlainRecord(payload) ? payload : {};
  const data = isPlainRecord(root.data) ? root.data : {};
  const sections = Array.isArray(root.sections)
    ? root.sections
    : Array.isArray(data.sections)
      ? data.sections
      : isPlainRecord(root.section)
        ? [root.section]
        : [];
  return sections.filter(isPlainRecord).map((section) => section as unknown as ReusableSectionExportEntry);
};

const downloadJson = (payload: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const optionalCanvasSizeFromRecord = (record: Record<string, unknown> | undefined): CanvasSize | undefined => {
  const value = record?.canvasSize;
  if (!isPlainRecord(value)) return undefined;
  const width = Number(value.width);
  const height = Number(value.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1200,
    height: Number.isFinite(height) && height > 0 ? height : 520,
  };
};

const canvasElementsFromRecord = (record: Record<string, unknown> | undefined): CanvasElement[] => (
  Array.isArray(record?.elements) ? record.elements as CanvasElement[] : []
);

const defaultSectionContent = (name: string, description: string, frontendDesign: SiteFrontendDesignContract | null): ReusableSectionContent => {
  const titleId = makeElementId('frontend-section-heading');
  const bodyId = makeElementId('frontend-section-text');
  const rootId = makeElementId('frontend-section');

  return {
    canvasSize: { width: 1200, height: 520 },
    customCSS: frontendDesign?.tokens?.customCss || '',
    customJS: '',
    elements: [
      {
        id: rootId,
        type: 'section',
        name,
        x: 0,
        y: 0,
        width: 1200,
        height: 520,
        zIndex: 1,
        props: {
          content: name,
          frontendDesignSeeded: true,
        },
        styles: {
          backgroundColor: frontendDesign?.tokens?.colors?.surface || '#ffffff',
          color: frontendDesign?.tokens?.colors?.text || '#111827',
          borderRadius: 12,
          padding: 48,
        },
        children: [
          {
            id: titleId,
            type: 'heading',
            name: `${name} heading`,
            x: 64,
            y: 96,
            width: 760,
            height: 88,
            zIndex: 2,
            props: { content: name, level: 'h2' },
            styles: {
              fontFamily: frontendDesign?.tokens?.fonts?.heading || 'Inter',
              fontSize: 48,
              fontWeight: 700,
              color: frontendDesign?.tokens?.colors?.text || '#111827',
            },
          },
          {
            id: bodyId,
            type: 'paragraph',
            name: `${name} copy`,
            x: 64,
            y: 204,
            width: 640,
            height: 112,
            zIndex: 2,
            props: { content: description || 'Reusable section seeded from the connected frontend design contract.' },
            styles: {
              fontFamily: frontendDesign?.tokens?.fonts?.body || 'Inter',
              fontSize: 18,
              lineHeight: 1.6,
              color: frontendDesign?.tokens?.colors?.muted || '#4b5563',
            },
          },
        ],
      },
    ],
  };
};

const templateContentRecord = (template: SiteFrontendDesignTemplate): Record<string, unknown> => {
  const content = isPlainRecord(template.content) ? template.content : {};
  const section = isPlainRecord(content.section) ? content.section : {};
  return { ...content, ...section };
};

const buildFrontendSectionTemplateBlueprint = (
  template: SiteFrontendDesignTemplate,
  frontendDesign: SiteFrontendDesignContract | null,
): SectionTemplateBlueprint => {
  const content = templateContentRecord(template);
  const name = optionalStringFromRecord(content, 'name') || optionalStringFromRecord(content, 'title') || template.name;
  const description = template.description || optionalStringFromRecord(content, 'description') || 'Reusable section seeded from the connected frontend design contract.';
  const elements = canvasElementsFromRecord(content);
  const canvasSize = optionalCanvasSizeFromRecord(content) || { width: 1200, height: 520 };

  return {
    name,
    slug: normalizeSlug(optionalStringFromRecord(content, 'slug') || template.id || name, 'frontend-section'),
    description,
    category: optionalStringFromRecord(content, 'category') || 'frontend',
    status: content.status === 'archived' ? 'archived' : 'active',
    tags: optionalStringListFromRecord(content, 'tags') || ['frontend-design', 'section'],
    content: elements.length > 0
      ? {
          elements,
          canvasSize,
          customCSS: optionalStringFromRecord(content, 'customCSS') || frontendDesign?.tokens?.customCss || '',
          customJS: optionalStringFromRecord(content, 'customJS') || '',
        }
      : defaultSectionContent(name, description, frontendDesign),
  };
};

const buildFrontendSectionTemplateMetadata = (
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

const getSectionFrontendTemplateId = (section: ReusableSection): string | undefined => (
  typeof section.metadata?.frontendDesignTemplateId === 'string'
    ? section.metadata.frontendDesignTemplateId
    : undefined
);

const contentElementSummary = (content: ReusableSectionContent) => {
  const roots = content.elements.length;
  const nested = content.elements.reduce((count, element) => count + (element.children?.length || 0), 0);
  return `${roots} root${roots === 1 ? '' : 's'}${nested ? `, ${nested} nested` : ''}`;
};

const parseReusableSectionContent = (rawJson: string): ReusableSectionContent => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Content JSON must be valid JSON.');
  }

  const normalized = normalizeSavedCanvasContent(rawJson);
  if (normalized.elements.length === 0) {
    throw new Error('Reusable section content must include at least one element.');
  }

  const parsedRecord = isPlainRecord(parsed) ? parsed : {};
  return {
    elements: normalized.elements,
    canvasSize: normalized.canvasSize,
    customCSS: typeof parsedRecord.customCSS === 'string' ? parsedRecord.customCSS : normalized.customCSS || '',
    customJS: typeof parsedRecord.customJS === 'string' ? parsedRecord.customJS : '',
  };
};

function ReusableSectionsRoute() {
  const { sites } = useStore();
  const currentAdmin = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [sections, setSections] = useState<ReusableSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(routeSearch.sectionId || null);
  const [statusFilter, setStatusFilter] = useState<SectionStatusFilter>(routeSearch.status || 'all');
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [formState, setFormState] = useState<ReusableSectionInput>({
    name: '',
    slug: '',
    description: '',
    category: 'general',
    status: 'active',
    tags: [],
    content: EMPTY_CONTENT,
    metadata: {},
  });
  const [contentJson, setContentJson] = useState(JSON.stringify(EMPTY_CONTENT, null, 2));
  const [tagsText, setTagsText] = useState('');
  const [contentValidationMessage, setContentValidationMessage] = useState<string | null>(null);
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(false);
  const [isCreatingTemplateId, setIsCreatingTemplateId] = useState<string | null>(null);
  const [visualEditorResetVersion, setVisualEditorResetVersion] = useState(0);
  const [visualEditorHasUnsavedChanges, setVisualEditorHasUnsavedChanges] = useState(false);
  const [sectionVersions, setSectionVersions] = useState<ReusableSectionVersions | null>(null);
  const [sectionInstances, setSectionInstances] = useState<ReusableSectionInstancesReport | null>(null);
  const [sectionMetadata, setSectionMetadata] = useState<ReusableSectionMetadata | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<SectionMetadataDraft>(() => metadataDraftFromLibrary(null));
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteSection, setPendingDeleteSection] = useState<ReusableSection | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSlug = activeSite?.slug || activeSiteId;
  const activeSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) || null,
    [sections, selectedSectionId],
  );
  const frontendSectionTemplates = useMemo(
    () => (frontendDesign?.templates || []).filter((template) => template.type === 'section'),
    [frontendDesign?.templates],
  );
  const activeFrontendTemplateId = routeSearch.frontendTemplate || '';
  const frontendSectionBlueprints = useMemo(
    () => frontendSectionTemplates.map((template) => ({
      template,
      blueprint: buildFrontendSectionTemplateBlueprint(template, frontendDesign),
    })),
    [frontendDesign, frontendSectionTemplates],
  );
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewSections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS);
  const canEditSections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS);
  const canDeleteSections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.delete', REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS);
  const viewPermissionTitle = canViewSections ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.view', REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS);
  const editPermissionTitle = canEditSections ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeleteSections ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.delete', REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS);
  const isBusy = isLoading || isSaving || Boolean(isCreatingTemplateId) || isPermissionMatrixPending;
  const isWorkflowBusy = isBusy || isWorkflowLoading;
  const filteredSections = useMemo(() => (
    sections.filter((section) => {
      if (statusFilter !== 'all' && section.status !== statusFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return [
        section.name,
        section.slug,
        section.description || '',
        section.category,
        ...section.tags,
        getSectionFrontendTemplateId(section) || '',
      ].join(' ').toLowerCase().includes(q);
    })
  ), [searchQuery, sections, statusFilter]);
  const sectionMetrics = useMemo(() => {
    const active = sections.filter((section) => section.status === 'active').length;
    const frontendSeeded = sections.filter((section) => getSectionFrontendTemplateId(section)).length;
    const elements = sections.reduce((total, section) => total + section.content.elements.length, 0);
    return [
      { label: 'Sections', value: sections.length, detail: `${active} active` },
      { label: 'Elements', value: elements, detail: 'Reusable roots saved' },
      { label: 'Frontend seeded', value: frontendSeeded, detail: 'Preserve design contract' },
      { label: 'Templates', value: frontendSectionTemplates.length, detail: 'Connected frontend sections' },
    ];
  }, [frontendSectionTemplates.length, sections]);
  const visualEditorContent = useMemo(() => {
    try {
      return parseReusableSectionContent(contentJson);
    } catch {
      return formState.content || EMPTY_CONTENT;
    }
  }, [contentJson, formState.content]);
  const visualEditorSettings = useMemo<PageSettings>(() => ({
    title: formState.name || activeSection?.name || 'Reusable section',
    slug: formState.slug || activeSection?.slug || 'reusable-section',
    status: formState.status === 'archived' ? 'archived' : 'draft',
    scheduledAt: null,
    meta: {
      title: formState.name || activeSection?.name || 'Reusable section',
      description: formState.description || activeSection?.description || '',
    },
  }), [activeSection?.description, activeSection?.name, activeSection?.slug, formState.description, formState.name, formState.slug, formState.status]);
  const handleVisualEditorChange = useCallback((
    elements: CanvasElement[],
    _settings: PageSettings,
    canvasSize: CanvasSize = DEFAULT_SECTION_CANVAS_SIZE,
  ) => {
    setFormState((prev) => {
      const nextContent: ReusableSectionContent = {
        ...(prev.content || EMPTY_CONTENT),
        elements,
        canvasSize,
      };
      const nextJson = JSON.stringify(nextContent, null, 2);
      setContentJson((current) => (current === nextJson ? current : nextJson));
      return { ...prev, content: nextContent };
    });
  }, []);
  const handoffManifest = useMemo(() => ({
    schemaVersion: 'backy.reusable-sections.handoff.v1',
    site: { id: activeSiteId, slug: activeSiteSlug, name: activeSite?.name || activeSiteId },
    frontendDesign: frontendDesign ? {
      status: frontendDesign.status,
      source: frontendDesign.source,
      sectionTemplates: frontendSectionTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        bindingHints: template.bindingHints || [],
      })),
    } : null,
    sections: sections.map((section) => ({
      id: section.id,
      slug: section.slug,
      name: section.name,
      status: section.status,
      category: section.category,
      tags: section.tags,
      elementSummary: contentElementSummary(section.content),
      frontendDesignTemplateId: getSectionFrontendTemplateId(section),
      metadata: section.metadata || {},
    })),
  }), [activeSite?.name, activeSiteId, activeSiteSlug, frontendDesign, frontendSectionTemplates, sections]);
  const handoffText = useMemo(() => JSON.stringify(handoffManifest, null, 2), [handoffManifest]);

  const updateRouteSearch = (next: ReusableSectionsSearchUpdate) => {
    const nextSectionId = next.sectionId === null ? null : next.sectionId ?? selectedSectionId;
    navigate({
      to: '/reusable-sections',
      search: {
        siteId: next.siteId || activeSiteId,
        ...(nextSectionId ? { sectionId: nextSectionId } : {}),
        ...((next.status || statusFilter) !== 'all' ? { status: next.status || statusFilter } : {}),
        ...((next.q ?? searchQuery).trim() ? { q: (next.q ?? searchQuery).trim() } : {}),
      },
      replace: true,
    });
  };

  const showPermissionDenied = (key: ReusableSectionPermissionKey, action: string) => {
    setNotice(null);
    setError(`Your account needs ${key} to ${action}. ${adminPermissionReason(permissionMatrix, currentAdmin, key, REUSABLE_SECTION_PERMISSION_ROLE_DEFAULTS)}`);
  };

  const setFormFromSection = (section: ReusableSection | null) => {
    if (!section) {
      setFormState({
        name: '',
        slug: '',
        description: '',
        category: 'general',
        status: 'active',
        tags: [],
        content: EMPTY_CONTENT,
        metadata: {},
      });
      setContentJson(JSON.stringify(EMPTY_CONTENT, null, 2));
      setTagsText('');
      setContentValidationMessage(null);
      setSectionVersions(null);
      setSectionInstances(null);
      setSectionMetadata(null);
      setMetadataDraft(metadataDraftFromLibrary(null));
      setVisualEditorHasUnsavedChanges(false);
      setVisualEditorResetVersion((current) => current + 1);
      return;
    }

    setFormState({
      name: section.name,
      slug: section.slug,
      description: section.description || '',
      category: section.category,
      status: section.status,
      tags: section.tags,
      content: section.content,
      metadata: section.metadata || {},
      sourceElementId: section.sourceElementId,
      updatedBy: 'admin',
    });
    setContentJson(JSON.stringify(section.content, null, 2));
    setTagsText(section.tags.join(', '));
    setContentValidationMessage(null);
    setVisualEditorHasUnsavedChanges(false);
    setVisualEditorResetVersion((current) => current + 1);
  };

  const normalizeContentJsonForEditing = () => {
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'edit reusable section content');
      return;
    }

    try {
      const content = parseReusableSectionContent(contentJson);
      setContentJson(JSON.stringify(content, null, 2));
      setFormState((prev) => ({ ...prev, content }));
      setContentValidationMessage(`${content.elements.length} reusable root${content.elements.length === 1 ? '' : 's'} ready.`);
      setError(null);
      setVisualEditorResetVersion((current) => current + 1);
    } catch (validationError) {
      setContentValidationMessage(null);
      setError(validationError instanceof Error ? validationError.message : 'Unable to validate content JSON');
    }
  };

  const insertStarterContent = () => {
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'edit reusable section content');
      return;
    }

    const content = defaultSectionContent(
      formState.name.trim() || 'New reusable section',
      formState.description || 'Reusable section starter content.',
      frontendDesign,
    );
    setContentJson(JSON.stringify(content, null, 2));
    setFormState((prev) => ({ ...prev, content }));
    setContentValidationMessage('Starter section content inserted.');
    setError(null);
    setVisualEditorResetVersion((current) => current + 1);
  };

  const selectSection = (section: ReusableSection | null) => {
    setSelectedSectionId(section?.id || null);
    setFormFromSection(section);
    updateRouteSearch({ sectionId: section?.id || null });
  };

  const loadSections = async () => {
    if (!activeSiteId) return;
    if (isPermissionMatrixPending) return;
    if (!canViewSections) {
      setSections([]);
      setFrontendDesign(null);
      setError(viewPermissionTitle || 'Your account cannot view reusable sections.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const nextSections = await listReusableSections(activeSiteId, { status: 'all' });
      setSections(nextSections);
      const nextSelected = nextSections.find((section) => section.id === selectedSectionId)
        || nextSections.find((section) => section.id === routeSearch.sectionId || section.slug === routeSearch.sectionId)
        || null;
      if (nextSelected) {
        setSelectedSectionId(nextSelected.id);
        setFormFromSection(nextSelected);
      } else if (!selectedSectionId) {
        setFormFromSection(null);
      }
    } catch (loadError) {
      setSections([]);
      setError(isAdminPermissionDeniedError(loadError)
        ? viewPermissionTitle || 'Your account cannot view reusable sections.'
        : loadError instanceof Error ? loadError.message : 'Unable to load reusable sections');
    } finally {
      setIsLoading(false);
    }
  };

  const loadReusableSectionWorkflow = async (sectionId = selectedSectionId) => {
    if (!activeSiteId || !sectionId || isPermissionMatrixPending) return;
    if (!canViewSections) {
      showPermissionDenied('pages.view', 'view reusable section workflow state');
      return;
    }

    setIsWorkflowLoading(true);
    setError(null);
    try {
      const [versions, instances, metadata] = await Promise.all([
        listReusableSectionVersions(activeSiteId, sectionId),
        getReusableSectionInstances(activeSiteId, sectionId),
        getReusableSectionMetadata(activeSiteId, sectionId),
      ]);
      setSectionVersions(versions);
      setSectionInstances(instances);
      setSectionMetadata(metadata);
      setMetadataDraft(metadataDraftFromLibrary(metadata));
    } catch (workflowError) {
      setSectionVersions(null);
      setSectionInstances(null);
      setSectionMetadata(null);
      setMetadataDraft(metadataDraftFromLibrary(null));
      setError(isAdminPermissionDeniedError(workflowError)
        ? viewPermissionTitle || 'Your account cannot view reusable section workflow state.'
        : workflowError instanceof Error ? workflowError.message : 'Unable to load reusable section workflow state');
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const downloadReusableSectionsExport = async (selectedOnly = false) => {
    if (isWorkflowBusy) return;
    if (!canViewSections) {
      showPermissionDenied('pages.view', 'export reusable sections');
      return;
    }

    setIsWorkflowLoading(true);
    setError(null);
    setNotice(null);
    try {
      const sectionIds = selectedOnly && activeSection
        ? [activeSection.id]
        : filteredSections.map((section) => section.id);
      const exported = await exportReusableSections(activeSiteId, {
        status: 'all',
        sectionIds,
      });
      downloadJson(exported, `${activeSiteSlug}-reusable-sections-${selectedOnly && activeSection ? activeSection.slug : 'export'}.json`);
      setNotice(`Exported ${exported.export.sectionCount} reusable section${exported.export.sectionCount === 1 ? '' : 's'}.`);
    } catch (exportError) {
      setError(isAdminPermissionDeniedError(exportError)
        ? viewPermissionTitle || 'Your account cannot export reusable sections.'
        : exportError instanceof Error ? exportError.message : 'Unable to export reusable sections');
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const handleReusableSectionsImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isWorkflowBusy) return;
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'import reusable sections');
      return;
    }

    setIsWorkflowLoading(true);
    setError(null);
    setNotice(null);
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const importSections = reusableSectionExportEntriesFromPayload(payload);
      if (importSections.length === 0) {
        throw new Error('Import file must contain reusable section exports with content.elements.');
      }

      const result = await importReusableSections(activeSiteId, {
        sections: importSections,
        upsert: true,
        importedBy: currentAdmin?.email || currentAdmin?.fullName || 'admin',
      });
      setSections((current) => [
        ...result.sections,
        ...current.filter((section) => !result.sections.some((imported) => imported.id === section.id || imported.slug === section.slug)),
      ]);
      const firstImported = result.sections[0] || null;
      if (firstImported) {
        setSelectedSectionId(firstImported.id);
        setFormFromSection(firstImported);
        updateRouteSearch({ sectionId: firstImported.id });
        void loadReusableSectionWorkflow(firstImported.id);
      }
      setNotice(`Imported ${result.import.total} reusable section${result.import.total === 1 ? '' : 's'} (${result.import.created} created, ${result.import.updated} updated).`);
    } catch (importError) {
      setError(isAdminPermissionDeniedError(importError)
        ? editPermissionTitle || 'Your account cannot import reusable sections.'
        : importError instanceof Error ? importError.message : 'Unable to import reusable sections');
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const restoreSectionVersion = async (version: number) => {
    if (!activeSection || isWorkflowBusy) return;
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'restore reusable section versions');
      return;
    }

    setIsWorkflowLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await restoreReusableSectionVersion(activeSiteId, activeSection.id, version, {
        expectedVersion: sectionMetadata?.version || sectionVersions?.currentVersion,
        expectedUpdatedAt: activeSection.updatedAt,
        restoredBy: currentAdmin?.email || currentAdmin?.fullName || 'admin',
      });
      setSections((current) => [result.section, ...current.filter((section) => section.id !== result.section.id)]);
      setSelectedSectionId(result.section.id);
      setFormFromSection(result.section);
      await loadReusableSectionWorkflow(result.section.id);
      setNotice(`Restored ${result.section.name} from version ${result.restoredFromVersion}.`);
    } catch (restoreError) {
      setError(isAdminPermissionDeniedError(restoreError)
        ? editPermissionTitle || 'Your account cannot restore reusable section versions.'
        : restoreError instanceof Error ? restoreError.message : 'Unable to restore reusable section version');
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const refreshSectionInstances = async (dryRun: boolean) => {
    if (!activeSection || isWorkflowBusy) return;
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'refresh reusable section instances');
      return;
    }

    setIsWorkflowLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await refreshReusableSectionInstances(activeSiteId, activeSection.id, {
        dryRun,
        updatedBy: currentAdmin?.email || currentAdmin?.fullName || 'admin',
      });
      await loadReusableSectionWorkflow(activeSection.id);
      setNotice(dryRun
        ? `${result.totals.instances} stale reusable section instance${result.totals.instances === 1 ? '' : 's'} can be refreshed.`
        : `Refreshed ${result.totals.instances} reusable section instance${result.totals.instances === 1 ? '' : 's'} across ${result.totals.targets} target${result.totals.targets === 1 ? '' : 's'}.`);
    } catch (refreshError) {
      setError(isAdminPermissionDeniedError(refreshError)
        ? editPermissionTitle || 'Your account cannot refresh reusable section instances.'
        : refreshError instanceof Error ? refreshError.message : 'Unable to refresh reusable section instances');
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const saveSectionMetadata = async () => {
    if (!activeSection || isWorkflowBusy) return;
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'update reusable section metadata');
      return;
    }

    setIsWorkflowLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateReusableSectionMetadata(activeSiteId, activeSection.id, {
        expectedVersion: sectionMetadata?.version,
        expectedUpdatedAt: activeSection.updatedAt,
        updatedBy: currentAdmin?.email || currentAdmin?.fullName || 'admin',
        displayName: metadataDraft.displayName,
        summary: metadataDraft.summary,
        usageNotes: metadataDraft.usageNotes,
        previewPath: metadataDraft.previewPath,
        labels: metadataDraft.labels,
      });
      setSections((current) => [result.section, ...current.filter((section) => section.id !== result.section.id)]);
      setFormFromSection(result.section);
      setSectionMetadata({
        sectionId: result.sectionId,
        metadata: result.metadata,
        library: result.library,
        version: result.version,
      });
      setMetadataDraft(metadataDraftFromLibrary(result));
      setNotice(`${result.section.name} metadata saved.`);
    } catch (metadataError) {
      setError(isAdminPermissionDeniedError(metadataError)
        ? editPermissionTitle || 'Your account cannot update reusable section metadata.'
        : metadataError instanceof Error ? metadataError.message : 'Unable to update reusable section metadata');
    } finally {
      setIsWorkflowLoading(false);
    }
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
      .catch((loadError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(loadError instanceof Error ? loadError.message : 'Unable to load reusable section permissions.');
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
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    setStatusFilter(routeSearch.status || 'all');
    setSearchQuery(routeSearch.q || '');
    setSelectedSectionId(routeSearch.sectionId || null);
  }, [routeSearch.q, routeSearch.sectionId, routeSearch.status]);

  useEffect(() => {
    if (isPermissionMatrixPending) return;
    void loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, canViewSections, isPermissionMatrixPending]);

  useEffect(() => {
    let cancelled = false;
    const loadFrontendDesign = async () => {
      if (isPermissionMatrixPending) return;
      if (!canViewSections) {
        setFrontendDesign(null);
        setFrontendDesignError(viewPermissionTitle || 'Your account cannot view reusable section frontend templates.');
        return;
      }

      setFrontendDesignLoading(true);
      setFrontendDesignError(null);
      try {
        const response = await getSiteFrontendDesign(activeSiteId);
        if (!cancelled) setFrontendDesign(response.frontendDesign);
      } catch (loadError) {
        if (!cancelled) {
          setFrontendDesign(null);
          setFrontendDesignError(isAdminPermissionDeniedError(loadError)
            ? viewPermissionTitle || 'Your account cannot view reusable section frontend templates.'
            : loadError instanceof Error ? loadError.message : 'Unable to load frontend design contract');
        }
      } finally {
        if (!cancelled) setFrontendDesignLoading(false);
      }
    };
    void loadFrontendDesign();
    return () => {
      cancelled = true;
    };
  }, [activeSiteId, canViewSections, isPermissionMatrixPending, viewPermissionTitle]);

  useEffect(() => {
    if (!activeSection?.id || isPermissionMatrixPending || !canViewSections) return;
    void loadReusableSectionWorkflow(activeSection.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection?.id, activeSiteId, canViewSections, isPermissionMatrixPending]);

  const copyText = async (value: string, label: string) => {
    if (isBusy) return;
    if (!canViewSections) {
      showPermissionDenied('pages.view', 'export reusable section manifests');
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

  const handleSiteChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (isBusy) return;
    const nextSiteId = event.target.value;
    setSelectedSiteId(nextSiteId);
    setSections([]);
    setSelectedSectionId(null);
    setPendingDeleteSection(null);
    setFormFromSection(null);
    navigate({ to: '/reusable-sections', search: { siteId: nextSiteId }, replace: true });
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'save reusable sections');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const parsedContent = parseReusableSectionContent(contentJson);
      const payload: ReusableSectionInput = {
        ...formState,
        name: formState.name.trim(),
        slug: normalizeSlug(formState.slug || formState.name, 'section'),
        description: formState.description || null,
        category: formState.category || 'general',
        status: formState.status || 'active',
        tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
        content: parsedContent,
        metadata: formState.metadata || {},
        updatedBy: 'admin',
        createdBy: 'admin',
      };
      const saved = selectedSectionId
        ? await updateReusableSection(activeSiteId, selectedSectionId, payload)
        : await createReusableSection(activeSiteId, payload);
      setSections((current) => [saved, ...current.filter((section) => section.id !== saved.id)]);
      setSelectedSectionId(saved.id);
      setFormFromSection(saved);
      setContentValidationMessage(`${saved.content.elements.length} reusable root${saved.content.elements.length === 1 ? '' : 's'} saved.`);
      updateRouteSearch({ sectionId: saved.id });
      setNotice(`${saved.name} saved.`);
    } catch (saveError) {
      setError(isAdminPermissionDeniedError(saveError)
        ? editPermissionTitle || 'Your account cannot save reusable sections.'
        : saveError instanceof Error ? saveError.message : 'Unable to save reusable section');
    } finally {
      setIsSaving(false);
    }
  };

  const saveVisualEditorSection = async (
    elements: CanvasElement[],
    settings: PageSettings,
    canvasSize: CanvasSize = visualEditorContent.canvasSize || DEFAULT_SECTION_CANVAS_SIZE,
  ) => {
    if (isBusy) {
      throw new Error('Wait for reusable section workflows to finish before saving the visual editor.');
    }
    if (!canEditSections) {
      const message = editPermissionTitle || 'Your account cannot save reusable sections.';
      showPermissionDenied('pages.edit', 'save reusable sections from the visual editor');
      throw new Error(message);
    }

    const nextName = formState.name.trim() || settings.title.trim() || activeSection?.name || 'Reusable section';
    const nextSlug = normalizeSlug(formState.slug || settings.slug || nextName, 'section');
    const nextContent: ReusableSectionContent = {
      ...visualEditorContent,
      elements,
      canvasSize,
    };
    const payload: ReusableSectionInput = {
      ...formState,
      name: nextName,
      slug: nextSlug,
      description: formState.description || settings.meta.description || null,
      category: formState.category || 'general',
      status: formState.status || 'active',
      tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
      content: nextContent,
      metadata: formState.metadata || {},
      updatedBy: currentAdmin?.email || currentAdmin?.fullName || 'admin',
      createdBy: currentAdmin?.email || currentAdmin?.fullName || 'admin',
    };

    try {
      const saved = selectedSectionId
        ? await updateReusableSection(activeSiteId, selectedSectionId, payload)
        : await createReusableSection(activeSiteId, payload);
      setSections((current) => [saved, ...current.filter((section) => section.id !== saved.id)]);
      setSelectedSectionId(saved.id);
      setFormState({
        name: saved.name,
        slug: saved.slug,
        description: saved.description || '',
        category: saved.category,
        status: saved.status,
        tags: saved.tags,
        content: saved.content,
        metadata: saved.metadata || {},
        sourceElementId: saved.sourceElementId,
        updatedBy: currentAdmin?.email || currentAdmin?.fullName || 'admin',
      });
      setContentJson(JSON.stringify(saved.content, null, 2));
      setTagsText(saved.tags.join(', '));
      setVisualEditorHasUnsavedChanges(false);
      setContentValidationMessage(`${saved.content.elements.length} reusable root${saved.content.elements.length === 1 ? '' : 's'} saved from visual editor.`);
      updateRouteSearch({ sectionId: saved.id });
      setNotice(`${saved.name} saved from the visual editor.`);
      void loadReusableSectionWorkflow(saved.id);
    } catch (saveError) {
      setError(isAdminPermissionDeniedError(saveError)
        ? editPermissionTitle || 'Your account cannot save reusable sections.'
        : saveError instanceof Error ? saveError.message : 'Unable to save reusable section from visual editor');
      throw saveError;
    }
  };

  const createFromFrontendTemplate = async (template: SiteFrontendDesignTemplate, blueprint: SectionTemplateBlueprint) => {
    if (isBusy) return;
    if (!canEditSections) {
      showPermissionDenied('pages.edit', 'create reusable sections from frontend templates');
      return;
    }

    setIsCreatingTemplateId(template.id);
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const metadata = buildFrontendSectionTemplateMetadata(template, frontendDesign);
      const saved = await createReusableSection(activeSiteId, {
        ...blueprint,
        metadata,
        sourceElementId: template.id,
        createdBy: 'admin',
        updatedBy: 'admin',
      });
      setSections((current) => [saved, ...current.filter((section) => section.id !== saved.id)]);
      setSelectedSectionId(saved.id);
      setFormFromSection(saved);
      updateRouteSearch({ sectionId: saved.id });
      setNotice(`${saved.name} created from frontend design template ${template.name}.`);
    } catch (saveError) {
      setError(isAdminPermissionDeniedError(saveError)
        ? editPermissionTitle || 'Your account cannot create reusable sections.'
        : saveError instanceof Error ? saveError.message : 'Unable to create reusable section from frontend template');
    } finally {
      setIsCreatingTemplateId(null);
      setIsSaving(false);
    }
  };

  const requestDeleteSection = (section: ReusableSection) => {
    if (isBusy) return;
    if (!canDeleteSections) {
      showPermissionDenied('pages.delete', 'delete reusable sections');
      return;
    }

    setError(null);
    setNotice(null);
    setPendingDeleteSection(section);
  };

  const confirmDeleteSection = async () => {
    const section = pendingDeleteSection;
    if (!section || isBusy) return;
    if (!canDeleteSections) {
      showPermissionDenied('pages.delete', 'delete reusable sections');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteReusableSection(activeSiteId, section.id);
      setSections((current) => current.filter((item) => item.id !== section.id));
      if (selectedSectionId === section.id) {
        setSelectedSectionId(null);
        setFormFromSection(null);
        updateRouteSearch({ sectionId: null });
      }
      setPendingDeleteSection(null);
      setNotice(`${section.name} deleted.`);
    } catch (deleteError) {
      setError(isAdminPermissionDeniedError(deleteError)
        ? deletePermissionTitle || 'Your account cannot delete reusable sections.'
        : deleteError instanceof Error ? deleteError.message : 'Unable to delete reusable section');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageShell
      title="Reusable sections"
      description="Manage saved editor sections and frontend-derived UI blocks for every custom site."
      action={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void loadSections()} disabled={isBusy || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (!canEditSections) {
                showPermissionDenied('pages.edit', 'create reusable sections');
                return;
              }
              setSelectedSectionId(null);
              setFormFromSection(null);
              updateRouteSearch({ sectionId: null });
            }}
            disabled={isBusy || !canEditSections}
            title={!canEditSections ? editPermissionTitle : undefined}
            iconStart={<Plus className="size-4" />}
          >
            New section
          </Button>
        </div>
      }
    >
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleReusableSectionsImport(event)}
        data-testid="reusable-sections-import-input"
      />
      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}
      {permissionError ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {permissionError}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}
      {pendingDeleteSection ? (
        <div
          className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
          role="dialog"
          aria-modal="false"
          aria-labelledby="reusable-section-delete-title"
          data-testid="reusable-section-delete-confirmation"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div id="reusable-section-delete-title" className="font-semibold">
                Delete reusable section?
              </div>
              <p className="mt-1 text-red-900">
                This removes "{pendingDeleteSection.name}" from the section library and page editor inserts. This cannot be undone from the admin UI.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPendingDeleteSection(null)}
                disabled={isSaving}
                data-testid="reusable-section-delete-cancel"
              >
                Keep section
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void confirmDeleteSection()}
                disabled={isSaving || !canDeleteSections}
                title={!canDeleteSections ? deletePermissionTitle : undefined}
                iconStart={<Trash2 className="size-3.5" />}
                data-testid="reusable-section-delete-confirm"
              >
                {isSaving ? 'Deleting...' : 'Delete section'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-5 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="reusable-sections-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Reusable section command center</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {filteredSections.length} shown
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Reusable sections are saved editor blocks that custom frontends, pages, and templates can reuse without losing design tokens, chrome context, or binding hints.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copyText(handoffText, 'Reusable sections handoff manifest')} disabled={isBusy || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
              Copy manifest
            </Button>
            <Button size="sm" onClick={() => void downloadReusableSectionsExport(false)} disabled={isWorkflowBusy || filteredSections.length === 0 || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<Download className="size-4" />} data-testid="reusable-sections-export-visible">
              Export visible
            </Button>
            <Button size="sm" onClick={() => importInputRef.current?.click()} disabled={isWorkflowBusy || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<Upload className="size-4" />} data-testid="reusable-sections-import">
              Import JSON
            </Button>
            <Button size="sm" onClick={() => void loadSections()} disabled={isBusy || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {sectionMetrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <Panel id="reusable-sections-site" className="mb-5 scroll-mt-24">
        <PanelHeader
          title="Site scope and filters"
          description="Choose which website owns these saved section templates."
          icon={<Database className="size-4" />}
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Site</span>
              <select
                value={activeSiteId}
                onChange={handleSiteChange}
                disabled={isBusy}
                className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sites.map((site) => {
                  const siteId = site.publicSiteId || site.id;
                  return <option key={site.id} value={siteId}>{site.name}</option>;
                })}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  const status = event.target.value as SectionStatusFilter;
                  setStatusFilter(status);
                  updateRouteSearch({ status });
                }}
                disabled={isBusy}
                className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Search</span>
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  updateRouteSearch({ q: event.target.value });
                }}
                disabled={isBusy}
                placeholder="Hero, footer, pricing..."
                className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>
        </PanelContent>
      </Panel>

      <Panel className="mb-5" data-testid="reusable-sections-workflows">
        <PanelHeader
          title="Import, versions, and instances"
          description="Use the backend section workflow APIs for portable section exports, version restore, structured metadata, and stale instance refreshes."
          icon={<GitBranch className="size-4" />}
          action={
            activeSection ? (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {activeSection.slug}
              </span>
            ) : null
          }
        />
        <PanelContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Library portability</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Export filtered sections or import a Backy reusable-section JSON backup with upsert.</p>
                </div>
                {isWorkflowLoading ? <RefreshCw className="size-4 animate-spin text-muted-foreground" /> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void downloadReusableSectionsExport(false)} disabled={isWorkflowBusy || filteredSections.length === 0 || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
                  Export visible
                </Button>
                <Button size="sm" onClick={() => void downloadReusableSectionsExport(true)} disabled={isWorkflowBusy || !activeSection || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<Download className="size-4" />} data-testid="reusable-sections-export-selected">
                  Export selected
                </Button>
                <Button size="sm" onClick={() => importInputRef.current?.click()} disabled={isWorkflowBusy || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<Upload className="size-4" />}>
                  Import JSON
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Instance propagation</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Find synced page/post instances and refresh stale copies from the selected source section.</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {sectionInstances ? `${sectionInstances.totals.stale} stale` : activeSection ? 'Not loaded' : 'Select section'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border border-border px-2 py-2">
                  <div className="font-semibold tabular-nums text-foreground">{sectionInstances?.totals.targets ?? 0}</div>
                  <div className="text-muted-foreground">Targets</div>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <div className="font-semibold tabular-nums text-foreground">{sectionInstances?.totals.instances ?? 0}</div>
                  <div className="text-muted-foreground">Instances</div>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <div className="font-semibold tabular-nums text-foreground">{sectionInstances?.totals.stale ?? 0}</div>
                  <div className="text-muted-foreground">Stale</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => activeSection ? void loadReusableSectionWorkflow(activeSection.id) : undefined} disabled={isWorkflowBusy || !activeSection || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<RefreshCw className="size-4" />} data-testid="reusable-section-workflow-load">
                  Load workflow
                </Button>
                <Button size="sm" onClick={() => void refreshSectionInstances(true)} disabled={isWorkflowBusy || !activeSection || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined}>
                  Dry run
                </Button>
                <Button size="sm" variant="primary" onClick={() => void refreshSectionInstances(false)} disabled={isWorkflowBusy || !activeSection || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<RotateCcw className="size-4" />}>
                  Refresh instances
                </Button>
              </div>
            </div>
          </div>

          {activeSection ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Version history</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Restore an earlier captured section version with backend conflict checks.</p>
                  </div>
                  <History className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {(sectionVersions?.versions || []).slice(0, 8).map((version) => (
                    <div key={`${version.version}-${version.updatedAt}`} className="rounded-md border border-border p-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground">v{version.version}{version.current ? ' current' : ''}</div>
                          <div className="mt-1 truncate text-muted-foreground">{version.name} · {formatDate(version.updatedAt)}</div>
                        </div>
                        <Button size="sm" onClick={() => void restoreSectionVersion(version.version)} disabled={isWorkflowBusy || version.current || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<RotateCcw className="size-3.5" />}>
                          Restore
                        </Button>
                      </div>
                    </div>
                  ))}
                  {sectionVersions && sectionVersions.versions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No versions are available yet.</p>
                  ) : null}
                  {!sectionVersions ? (
                    <p className="text-xs text-muted-foreground">Load workflow state to inspect versions.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Structured library metadata</h3>
                    <p className="mt-1 text-xs text-muted-foreground">These fields feed section library search, previews, ownership, and handoff labels.</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    v{sectionMetadata?.version || sectionVersions?.currentVersion || 1}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">Display name</span>
                    <input
                      value={metadataDraft.displayName}
                      onChange={(event) => setMetadataDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                      disabled={isWorkflowBusy || !canEditSections}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">Preview path</span>
                    <input
                      value={metadataDraft.previewPath}
                      onChange={(event) => setMetadataDraft((prev) => ({ ...prev, previewPath: event.target.value }))}
                      disabled={isWorkflowBusy || !canEditSections}
                      placeholder="/sections/hero"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </div>
                <label className="mt-3 block space-y-1 text-xs">
                  <span className="font-medium">Summary</span>
                  <textarea
                    value={metadataDraft.summary}
                    onChange={(event) => setMetadataDraft((prev) => ({ ...prev, summary: event.target.value }))}
                    disabled={isWorkflowBusy || !canEditSections}
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="mt-3 block space-y-1 text-xs">
                  <span className="font-medium">Usage notes</span>
                  <textarea
                    value={metadataDraft.usageNotes}
                    onChange={(event) => setMetadataDraft((prev) => ({ ...prev, usageNotes: event.target.value }))}
                    disabled={isWorkflowBusy || !canEditSections}
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="mt-3 block space-y-1 text-xs">
                  <span className="font-medium">Labels</span>
                  <input
                    value={metadataDraft.labels}
                    onChange={(event) => setMetadataDraft((prev) => ({ ...prev, labels: event.target.value }))}
                    disabled={isWorkflowBusy || !canEditSections}
                    placeholder="marketing, dark, responsive"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="primary" onClick={() => void saveSectionMetadata()} disabled={isWorkflowBusy || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<Save className="size-4" />} data-testid="reusable-section-metadata-save">
                    Save metadata
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </PanelContent>
      </Panel>

      <Panel className="mb-5" data-testid="reusable-sections-visual-editor">
        <PanelHeader
          title="Visual section editor"
          description="Edit the selected section with the same drag, nest, group, layer, media, and property controls used by the page canvas."
          icon={<Layers3 className="size-4" />}
          action={
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {visualEditorHasUnsavedChanges ? 'Unsaved canvas' : `${visualEditorContent.elements.length} root${visualEditorContent.elements.length === 1 ? '' : 's'}`}
            </span>
          }
        />
        <PanelContent>
          <div className="h-[780px] min-h-[680px] overflow-hidden rounded-lg border border-border bg-background" data-testid="reusable-section-canvas-editor">
            <CanvasEditor
              key={`${selectedSectionId || 'new'}:${visualEditorResetVersion}`}
              mode="section"
              initialElements={visualEditorContent.elements}
              initialSize={visualEditorContent.canvasSize || DEFAULT_SECTION_CANVAS_SIZE}
              initialSettings={visualEditorSettings}
              onSave={saveVisualEditorSection}
              onChange={handleVisualEditorChange}
              hideNavigation
              hideSettings
              saveOwnerLabel="section editor"
              saveOwnerVersion={activeSection?.updatedAt || selectedSectionId || visualEditorResetVersion}
              mediaContext={{
                siteId: activeSiteId,
                scope: 'global',
                targetId: selectedSectionId || 'new-section',
                targetLabel: formState.name || activeSection?.name || 'Reusable section',
              }}
              validateSettings={(settings) => {
                if (!settings.title.trim()) return 'Section name is required before saving.';
                if (!normalizeSlug(settings.slug || settings.title, '')) return 'Section slug is required before saving.';
                return null;
              }}
              canView={canViewSections}
              canEdit={canEditSections}
              canPublish={false}
              canViewMedia={canViewSections}
              canCreateMedia={canEditSections}
              canViewCollections={canViewSections}
              canDeleteReusableSections={canDeleteSections}
              editDisabledReason={editPermissionTitle}
              publishDisabled
              publishDisabledReason="Reusable sections are activated from section status, not published from the canvas."
              mediaViewDisabledReason={viewPermissionTitle}
              mediaCreateDisabledReason={editPermissionTitle}
              collectionsViewDisabledReason={viewPermissionTitle}
              reusableDeleteDisabledReason={deletePermissionTitle}
              onUnsavedChangesChange={setVisualEditorHasUnsavedChanges}
              className="h-full w-full"
            />
          </div>
        </PanelContent>
      </Panel>

      {(frontendSectionTemplates.length > 0 || frontendDesignLoading || frontendDesignError) && (
        <Panel className="mb-5" data-testid="reusable-sections-frontend-template-options">
          <PanelHeader
            title="Frontend design sections"
            description="Create reusable editor blocks from the connected frontend contract while preserving source, tokens, chrome, CSS, and binding hints."
            icon={<Sparkles className="size-4" />}
            action={
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {frontendDesign?.source.label || frontendDesign?.source.type || 'Frontend contract'}
              </span>
            }
          />
          <PanelContent>
            {frontendDesignLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                Loading captured section templates...
              </div>
            ) : null}
            {frontendDesignError ? (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4" />
                {frontendDesignError}
              </div>
            ) : null}
            {frontendSectionBlueprints.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {frontendSectionBlueprints.map(({ template, blueprint }) => {
                  const metadata = buildFrontendSectionTemplateMetadata(template, frontendDesign);
                  const manifestText = JSON.stringify({
                    schemaVersion: 'backy.frontend-section-template.v1',
                    template,
                    section: { ...blueprint, metadata },
                  }, null, 2);
                  return (
                    <article
                      key={template.id}
                      className={cn(
                        'rounded-lg border bg-teal-50/50 p-4',
                        activeFrontendTemplateId === template.id
                          ? 'border-teal-600 ring-1 ring-teal-600'
                          : 'border-teal-200',
                      )}
                      data-active={activeFrontendTemplateId === template.id ? 'true' : 'false'}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description || blueprint.description}</p>
                        </div>
                        <span className="rounded-full bg-background px-2 py-1 text-[11px] font-medium text-teal-700">
                          {contentElementSummary(blueprint.content)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded bg-background px-2 py-1 text-[11px] text-muted-foreground">{blueprint.category}</span>
                        <span className="rounded bg-background px-2 py-1 text-[11px] text-muted-foreground">{template.bindingHints?.length || 0} bindings</span>
                        <span className="rounded bg-background px-2 py-1 text-[11px] text-muted-foreground">{blueprint.content.canvasSize?.width || 1200}x{blueprint.content.canvasSize?.height || 520}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                            variant="primary"
                            onClick={() => void createFromFrontendTemplate(template, blueprint)}
                            disabled={isBusy || !canEditSections}
                            title={!canEditSections ? editPermissionTitle : undefined}
                            iconStart={<Layers3 className="size-4" />}
                          data-testid={`reusable-sections-frontend-template-${template.id}`}
                        >
                          {isCreatingTemplateId === template.id ? 'Creating...' : 'Create section'}
                        </Button>
                          <Button size="sm" onClick={() => void copyText(manifestText, `${template.name} frontend section template`)} disabled={isBusy || !canViewSections} title={!canViewSections ? viewPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                            Copy schema
                          </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : !frontendDesignLoading && !frontendDesignError ? (
              <p className="text-sm text-muted-foreground">The current frontend contract has no section templates yet.</p>
            ) : null}
          </PanelContent>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel data-testid="reusable-sections-library">
          <PanelHeader
            title="Section library"
            description="Saved blocks available to page editors and custom frontend handoff APIs."
            icon={<Layers3 className="size-4" />}
          />
          <PanelContent>
            {filteredSections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No reusable sections match this view.
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredSections.map((section) => {
                  const frontendTemplateId = getSectionFrontendTemplateId(section);
                  return (
                    <article
                      key={section.id}
                      data-testid={`reusable-section-card-${section.id}`}
                      className={cn(
                      'rounded-lg border bg-background p-4 transition',
                      selectedSectionId === section.id ? 'border-primary shadow-sm' : 'border-border',
                    )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => selectSection(section)}
                            disabled={isBusy}
                            className="text-left text-sm font-semibold text-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {section.name}
                          </button>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.description || section.slug}</p>
                        </div>
                        <StatusBadge status={section.status === 'active' ? 'published' : 'archived'} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded border border-border px-2 py-1">{section.category}</span>
                        <span className="rounded border border-border px-2 py-1">{contentElementSummary(section.content)}</span>
                        {frontendTemplateId ? <span className="rounded border border-teal-200 bg-teal-50 px-2 py-1 text-teal-700">{frontendTemplateId}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">Updated {formatDate(section.updatedAt || section.createdAt || '')}</div>
                        <div className="flex gap-2">
                            <Button size="sm" onClick={() => selectSection(section)} disabled={isBusy}>{canEditSections ? 'Edit' : 'View'}</Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => requestDeleteSection(section)}
                              disabled={isBusy || !canDeleteSections}
                              title={!canDeleteSections ? deletePermissionTitle : undefined}
                              iconStart={<Trash2 className="size-3.5" />}
                              data-testid={`reusable-section-delete-${section.id}`}
                            >
                              Delete
                            </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </PanelContent>
        </Panel>

        <Panel id="reusable-sections-editor">
          <PanelHeader
            title={activeSection ? 'Edit section' : 'Create section'}
            description="Manual JSON editing is available for backend validation until the full visual sections manager is expanded."
            icon={<Code2 className="size-4" />}
          />
          <PanelContent>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Name</span>
                  <input
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    disabled={isBusy || !canEditSections}
                    title={!canEditSections ? editPermissionTitle : undefined}
                    data-testid="reusable-section-name"
                  className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  required
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Slug</span>
                    <input
                      value={formState.slug || ''}
                      onChange={(event) => setFormState((prev) => ({ ...prev, slug: normalizeSlug(event.target.value, '') }))}
                      disabled={isBusy || !canEditSections}
                      title={!canEditSections ? editPermissionTitle : undefined}
                      data-testid="reusable-section-slug"
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Category</span>
                    <input
                      value={formState.category || ''}
                      onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value }))}
                      disabled={isBusy || !canEditSections}
                      title={!canEditSections ? editPermissionTitle : undefined}
                      data-testid="reusable-section-category"
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Description</span>
                  <textarea
                    value={formState.description || ''}
                    onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                    disabled={isBusy || !canEditSections}
                    title={!canEditSections ? editPermissionTitle : undefined}
                    data-testid="reusable-section-description"
                  rows={3}
                  className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Status</span>
                    <select
                      value={formState.status || 'active'}
                      onChange={(event) => setFormState((prev) => ({ ...prev, status: event.target.value as ReusableSection['status'] }))}
                      disabled={isBusy || !canEditSections}
                      title={!canEditSections ? editPermissionTitle : undefined}
                      data-testid="reusable-section-status"
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Tags</span>
                    <input
                      value={tagsText}
                      onChange={(event) => setTagsText(event.target.value)}
                      disabled={isBusy || !canEditSections}
                      title={!canEditSections ? editPermissionTitle : undefined}
                      placeholder="hero, pricing, footer"
                    data-testid="reusable-section-tags"
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">Content JSON</span>
                  <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={insertStarterContent} disabled={isBusy || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<Sparkles className="size-3.5" />} data-testid="reusable-section-insert-starter">
                        Insert starter
                      </Button>
                      <Button size="sm" onClick={normalizeContentJsonForEditing} disabled={isBusy || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<Code2 className="size-3.5" />} data-testid="reusable-section-format-json">
                        Format JSON
                      </Button>
                  </div>
                </div>
                  <textarea
                    value={contentJson}
                  onChange={(event) => {
                    setContentJson(event.target.value);
                    setContentValidationMessage(null);
                  }}
                    disabled={isBusy || !canEditSections}
                    title={!canEditSections ? editPermissionTitle : undefined}
                    rows={14}
                  spellCheck={false}
                  data-testid="reusable-section-content-json"
                  className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                />
                {contentValidationMessage ? (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" data-testid="reusable-section-content-validation">
                    {contentValidationMessage}
                  </p>
                ) : null}
              </div>
              {activeSection?.metadata?.frontendDesignTemplateId ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 text-xs text-teal-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="size-3.5" />
                    Frontend design provenance retained
                  </div>
                  <div className="mt-1 font-mono">{String(activeSection.metadata.frontendDesignTemplateId)}</div>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={() => {
                      if (!canEditSections) {
                        showPermissionDenied('pages.edit', 'prepare reusable section edits');
                        return;
                      }
                      setSelectedSectionId(null);
                    setFormFromSection(null);
                    updateRouteSearch({ sectionId: null });
                  }}
                    disabled={isBusy || !canEditSections}
                    title={!canEditSections ? editPermissionTitle : undefined}
                    data-testid="reusable-section-reset"
                >
                  Reset
                </Button>
                  <Button type="submit" variant="primary" disabled={isBusy || formState.name.trim().length === 0 || !canEditSections} title={!canEditSections ? editPermissionTitle : undefined} iconStart={<Save className="size-4" />} data-testid="reusable-section-save">
                    {isSaving ? 'Saving...' : 'Save section'}
                </Button>
              </div>
            </form>
          </PanelContent>
        </Panel>
      </div>
    </PageShell>
  );
}
