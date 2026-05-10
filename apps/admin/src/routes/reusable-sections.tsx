import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { SiteSettings } from '@backy-cms/core';
import {
  createReusableSection,
  deleteReusableSection,
  getSiteFrontendDesign,
  listReusableSections,
  updateReusableSection,
  type ReusableSection,
  type ReusableSectionContent,
  type ReusableSectionInput,
} from '@/lib/adminContentApi';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { useStore } from '@/stores/mockStore';
import { cn, formatDate } from '@/lib/utils';
import type { CanvasElement, CanvasSize } from '@/types/editor';

type SectionStatusFilter = ReusableSection['status'] | 'all';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];

interface ReusableSectionsSearch {
  siteId?: string;
  sectionId?: string;
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

function ReusableSectionsRoute() {
  const { sites } = useStore();
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
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
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingTemplateId, setIsCreatingTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  const frontendSectionBlueprints = useMemo(
    () => frontendSectionTemplates.map((template) => ({
      template,
      blueprint: buildFrontendSectionTemplateBlueprint(template, frontendDesign),
    })),
    [frontendDesign, frontendSectionTemplates],
  );
  const isBusy = isLoading || isSaving || Boolean(isCreatingTemplateId);
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
  };

  const selectSection = (section: ReusableSection | null) => {
    setSelectedSectionId(section?.id || null);
    setFormFromSection(section);
    updateRouteSearch({ sectionId: section?.id || null });
  };

  const loadSections = async () => {
    if (!activeSiteId) return;
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
      setError(loadError instanceof Error ? loadError.message : 'Unable to load reusable sections');
    } finally {
      setIsLoading(false);
    }
  };

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
    void loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    let cancelled = false;
    const loadFrontendDesign = async () => {
      setFrontendDesignLoading(true);
      setFrontendDesignError(null);
      try {
        const response = await getSiteFrontendDesign(activeSiteId);
        if (!cancelled) setFrontendDesign(response.frontendDesign);
      } catch (loadError) {
        if (!cancelled) {
          setFrontendDesign(null);
          setFrontendDesignError(loadError instanceof Error ? loadError.message : 'Unable to load frontend design contract');
        }
      } finally {
        if (!cancelled) setFrontendDesignLoading(false);
      }
    };
    void loadFrontendDesign();
    return () => {
      cancelled = true;
    };
  }, [activeSiteId]);

  const copyText = async (value: string, label: string) => {
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
    setFormFromSection(null);
    navigate({ to: '/reusable-sections', search: { siteId: nextSiteId }, replace: true });
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const parsedContent = JSON.parse(contentJson) as ReusableSectionContent;
      if (!Array.isArray(parsedContent.elements) || parsedContent.elements.length === 0) {
        throw new Error('Reusable section content must include at least one element.');
      }
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
      updateRouteSearch({ sectionId: saved.id });
      setNotice(`${saved.name} saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save reusable section');
    } finally {
      setIsSaving(false);
    }
  };

  const createFromFrontendTemplate = async (template: SiteFrontendDesignTemplate, blueprint: SectionTemplateBlueprint) => {
    if (isBusy) return;
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
      setError(saveError instanceof Error ? saveError.message : 'Unable to create reusable section from frontend template');
    } finally {
      setIsCreatingTemplateId(null);
      setIsSaving(false);
    }
  };

  const handleDeleteSection = async (section: ReusableSection) => {
    if (isBusy) return;
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
      setNotice(`${section.name} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete reusable section');
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
          <Button size="sm" onClick={() => void loadSections()} disabled={isBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setSelectedSectionId(null);
              setFormFromSection(null);
              updateRouteSearch({ sectionId: null });
            }}
            disabled={isBusy}
            iconStart={<Plus className="size-4" />}
          >
            New section
          </Button>
        </div>
      }
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
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
            <Button size="sm" onClick={() => void copyText(handoffText, 'Reusable sections handoff manifest')} disabled={isBusy} iconStart={<Copy className="size-4" />}>
              Copy manifest
            </Button>
            <Button size="sm" onClick={() => void loadSections()} disabled={isBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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
                    <article key={template.id} className="rounded-lg border border-teal-200 bg-teal-50/50 p-4">
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
                          disabled={isBusy}
                          iconStart={<Layers3 className="size-4" />}
                          data-testid={`reusable-sections-frontend-template-${template.id}`}
                        >
                          {isCreatingTemplateId === template.id ? 'Creating...' : 'Create section'}
                        </Button>
                        <Button size="sm" onClick={() => void copyText(manifestText, `${template.name} frontend section template`)} disabled={isBusy} iconStart={<Copy className="size-4" />}>
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
                    <article key={section.id} className={cn(
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
                          <Button size="sm" onClick={() => selectSection(section)} disabled={isBusy}>Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => void handleDeleteSection(section)} disabled={isBusy} iconStart={<Trash2 className="size-3.5" />}>Delete</Button>
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
                  disabled={isBusy}
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
                    disabled={isBusy}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Category</span>
                  <input
                    value={formState.category || ''}
                    onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value }))}
                    disabled={isBusy}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Description</span>
                <textarea
                  value={formState.description || ''}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  disabled={isBusy}
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
                    disabled={isBusy}
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
                    disabled={isBusy}
                    placeholder="hero, pricing, footer"
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Content JSON</span>
                <textarea
                  value={contentJson}
                  onChange={(event) => setContentJson(event.target.value)}
                  disabled={isBusy}
                  rows={14}
                  spellCheck={false}
                  className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
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
                    setSelectedSectionId(null);
                    setFormFromSection(null);
                    updateRouteSearch({ sectionId: null });
                  }}
                  disabled={isBusy}
                >
                  Reset
                </Button>
                <Button type="submit" variant="primary" disabled={isBusy || formState.name.trim().length === 0} iconStart={<Save className="size-4" />}>
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
