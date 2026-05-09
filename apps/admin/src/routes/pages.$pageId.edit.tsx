/**
 * ============================================================================
 * BACKY CMS - PAGE EDITOR ROUTE
 * ============================================================================
 * 
 * Uses the reusable CanvasEditor component with real data persistence.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Archive, ArrowLeft, CheckCircle2, Copy, Download, ExternalLink, Eye, History, Maximize2, Minimize2, RefreshCw, RotateCcw } from 'lucide-react';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import { PageSettings } from '@/components/editor/PageSettingsModal';
import {
  archivePage,
  createPagePreview,
  getAdminApiBase,
  getPage,
  getPageReadiness,
  listPageRevisions,
  publishPage,
  rollbackPage,
  updatePage as updatePageFromApi,
  type ContentRevision,
  type PageReadiness,
} from '@/lib/adminContentApi';
import { useStore, type Page } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn } from '@/lib/utils';
import {
  createCanvasElement,
  normalizeSavedCanvasContent,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

export const Route = createFileRoute('/pages/$pageId/edit')({
  component: PageEditorRoute,
});

const PAGE_EDITOR_CONTROL_AREAS = [
  {
    title: 'Design canvas',
    detail: 'Drag, group, layer, bind, arrange, and focus the full design workspace.',
    href: '#page-editor-canvas',
  },
  {
    title: 'Publish controls',
    detail: 'Preview, publish, archive, and confirm the current route state.',
    href: '#page-editor-publish',
  },
  {
    title: 'Readiness checks',
    detail: 'Validate SEO, canvas content, route health, blockers, and public delivery.',
    href: '#page-editor-readiness',
  },
  {
    title: 'Revision history',
    detail: 'Restore saved snapshots when a design needs to roll back.',
    href: '#page-editor-revisions',
  },
  {
    title: 'Frontend handoff',
    detail: 'Track the page route, canvas dimensions, element count, and public status.',
    href: '#page-editor-handoff',
  },
] as const;

const slugify = (value: string) => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
);

const getPagePublicPath = (page: Pick<Page, 'slug' | 'isHomepage'>) => (
  page.isHomepage || page.slug === 'home' || page.slug === ''
    ? '/'
    : `/${slugify(page.slug)}`
);

function PageEditorRoute() {
  const navigate = useNavigate();
  const { pageId } = Route.useParams();
  const { sites, pages, updatePage } = useStore();
  const storePage = pages.find((candidate) => candidate.id === pageId);
  const storePageId = storePage?.id;
  const storePageSiteId = storePage?.siteId;
  const requestedSiteId = getSiteSelectionFromSearch(sites);
  const storePageSite = storePageSiteId
    ? sites.find((site) => siteMatchesIdentifier(site, storePageSiteId))
    : undefined;
  const fallbackSiteId = storePageSite?.publicSiteId || storePageSite?.id || requestedSiteId || 'site-demo';
  const [page, setPage] = useState<Page | null>(storePage || null);
  const [siteId, setSiteId] = useState(storePageSite?.publicSiteId || storePageSite?.id || storePage?.siteId || fallbackSiteId);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
  const [isPreviewBusy, setIsPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [pageReadiness, setPageReadiness] = useState<PageReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [editorResetVersion, setEditorResetVersion] = useState(0);
  const [pendingRestoreRevision, setPendingRestoreRevision] = useState<ContentRevision | null>(null);
  const [isWorkspaceFocus, setIsWorkspaceFocus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const localFallbackPage = storePage;
    const nextSiteId = storePageSite?.publicSiteId || storePageSite?.id || storePageSiteId || fallbackSiteId;
    setSiteId(nextSiteId);

    const loadPage = async () => {
      setIsLoadingPage(true);
      setLoadError(null);

      try {
        const backendPage = await getPage(nextSiteId, pageId);
        if (!cancelled) {
          setPage(backendPage);
          updatePage(pageId, backendPage);
        }
      } catch (error) {
        if (!cancelled) {
          if (localFallbackPage) {
            setPage(localFallbackPage);
            setLoadError(error instanceof Error ? error.message : 'Unable to load backend page.');
          } else {
            setLoadError(error instanceof Error ? error.message : 'Unable to load page.');
            setPage(null);
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPage(false);
        }
      }
    };

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [fallbackSiteId, pageId, storePageId, storePageSite?.id, storePageSite?.publicSiteId, storePageSiteId, updatePage]);

  useEffect(() => {
    if (!page) {
      return;
    }

    let cancelled = false;

    const loadRevisions = async () => {
      try {
        const nextRevisions = await listPageRevisions(siteId, pageId);
        if (!cancelled) {
          setRevisions(nextRevisions);
        }
      } catch {
        if (!cancelled) {
          setRevisions([]);
        }
      }
    };

    void loadRevisions();

    return () => {
      cancelled = true;
    };
  }, [page, pageId, siteId]);

  const loadPageReadiness = async () => {
    if (!page) {
      return null;
    }

    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const readiness = await getPageReadiness(siteId, pageId);
      setPageReadiness(readiness);
      return readiness;
    } catch (error) {
      setPageReadiness(null);
      setReadinessError(error instanceof Error ? error.message : 'Unable to load page readiness.');
      return null;
    } finally {
      setReadinessLoading(false);
    }
  };

  useEffect(() => {
    if (page) {
      void loadPageReadiness();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, siteId]);

  // Load Elements
  const { elements: initialElements, canvasSize: initialCanvasSize } = useMemo(
    () => normalizeSavedCanvasContent(page?.content || null),
    [page?.content]
  );

  const fallbackElements: CanvasElement[] = useMemo(() => {
    if (initialElements.length) {
      return initialElements;
    }

    return [
      createCanvasElement('heading', 100, 100, {
        id: page?.id || 'page-heading',
        width: 400,
        height: 60,
        props: {
          content: page?.title || 'New Page',
          level: 'h1',
          fontSize: 48,
          fontWeight: 'bold',
        },
      }),
      createCanvasElement('text', 100, 180, {
        id: `${page?.id || 'page'}-text`,
        width: 500,
        height: 80,
        props: {
          content: 'Start building your page...',
          fontSize: 18,
          lineHeight: 1.6,
        },
      }),
    ];
  }, [initialElements, page?.id, page?.title]);

  const parseSerializedContent = (serialized: string): unknown => {
    try {
      return JSON.parse(serialized);
    } catch {
      return {
        elements: [],
        canvasSize: initialCanvasSize,
      };
    }
  };

  // If page not found, show error
  if (isLoadingPage && !page) {
    return (
      <PageShell title="Loading page" description="Fetching editor content from the backend.">
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading page editor...
        </div>
      </PageShell>
    );
  }

  if (!page) {
    return (
      <PageShell title="Page Not Found" description={loadError || "The page you requested doesn't exist."}>
        <button onClick={() => navigate({ to: '/pages', search: { siteId } })} className="text-primary hover:underline">
          &larr; Back to Pages
        </button>
      </PageShell>
    );
  }

  // Load Settings
  const initialSettings: PageSettings = {
    title: page.title,
    slug: page.slug,
    status: page.status,
    scheduledAt: page.scheduledAt || null,
    meta: page.meta || { title: page.title, description: '' },
  };
  const pageReadinessFindings = pageReadiness?.checks
    .filter((check) => check.status !== 'pass')
    .slice(0, 3) || [];
  const isReadinessBlocked = pageReadiness?.statusLabel === 'blocked';
  const elementCount = initialElements.length || fallbackElements.length;
  const backendReadinessDetail = pageReadiness
    ? `${pageReadiness.score}% ${pageReadiness.statusLabel.replace('-', ' ')}.`
    : readinessError || 'Run readiness before publishing.';
  const hasUsableRoute = page.slug.trim().length > 0;
  const hasSeo = Boolean(page.meta?.title || page.title);
  const hasRevisionHistory = revisions.length > 0;
  const publicPath = getPagePublicPath(page);
  const selectedSite = sites.find((site) => siteMatchesIdentifier(site, siteId));
  const selectedSiteIdentifiers = new Set(
    [siteId, selectedSite?.id, selectedSite?.publicSiteId, selectedSite?.slug].filter(Boolean),
  );
  const selectedSitePages = pages.filter((candidate) => selectedSiteIdentifiers.has(candidate.siteId));
  const getPublicPathForSettings = (settings: PageSettings) => (
    page.isHomepage || settings.slug === 'home' || settings.slug.trim() === ''
      ? '/'
      : `/${slugify(settings.slug || settings.title || 'page')}`
  );
  const findRouteConflict = (settings: PageSettings) => {
    const nextPath = getPublicPathForSettings(settings);

    return selectedSitePages.find((candidate) => candidate.id !== page.id && getPagePublicPath(candidate) === nextPath) || null;
  };
  const currentRouteConflict = findRouteConflict(initialSettings);
  const validatePageSettings = (settings: PageSettings) => {
    const nextSlug = slugify(settings.slug || settings.title || 'page');
    const nextPath = getPublicPathForSettings(settings);
    const conflict = findRouteConflict(settings);

    if (!settings.title.trim()) {
      return 'Add a page title before saving settings.';
    }

    if (!settings.slug.trim() && !page.isHomepage) {
      return 'Add a URL slug before saving settings.';
    }

    if (nextPath !== '/' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nextSlug)) {
      return 'Use lowercase letters, numbers, and hyphens for the URL slug.';
    }

    if (conflict) {
      return `${nextPath} is already used by "${conflict.title}". Choose another slug before saving.`;
    }

    return null;
  };
  const editorReadinessChecks = [
    {
      label: 'Page identity',
      detail: page.title ? `${page.title} is the editor source.` : 'Add a title before handoff.',
      ready: Boolean(page.title),
    },
    {
      label: 'Route',
      detail: hasUsableRoute ? `/${page.slug}` : 'Add a slug so the frontend can resolve this page.',
      ready: hasUsableRoute,
    },
    {
      label: 'Route availability',
      detail: currentRouteConflict
        ? `${publicPath} conflicts with "${currentRouteConflict.title}".`
        : `${publicPath} is unique across ${selectedSitePages.length} page${selectedSitePages.length === 1 ? '' : 's'} in this site.`,
      ready: !currentRouteConflict,
    },
    {
      label: 'Canvas content',
      detail: elementCount > 0 ? `${elementCount} root layer${elementCount === 1 ? '' : 's'} ready for render.` : 'Add at least one element to the page.',
      ready: elementCount > 0,
    },
    {
      label: 'SEO handoff',
      detail: hasSeo ? 'Title metadata is available to frontend renderers.' : 'Add page title or SEO metadata.',
      ready: hasSeo,
    },
    {
      label: 'Backend readiness',
      detail: backendReadinessDetail,
      ready: Boolean(pageReadiness) && !isReadinessBlocked,
    },
    {
      label: 'Revision safety',
      detail: hasRevisionHistory ? `${revisions.length} saved revision${revisions.length === 1 ? '' : 's'}.` : 'Save once to create a restore point.',
      ready: hasRevisionHistory,
    },
  ];
  const editorReadyCount = editorReadinessChecks.filter((check) => check.ready).length;
  const editorReadiness = {
    score: Math.round((editorReadyCount / editorReadinessChecks.length) * 100),
    checks: editorReadinessChecks,
    workflow: [
      { label: 'Design', detail: 'Build the page with components, media, layers, grouping, and bindings.' },
      { label: 'Validate', detail: 'Refresh readiness to catch route, SEO, empty canvas, and delivery blockers.' },
      { label: 'Preview', detail: 'Open a temporary public preview before changing the published route.' },
      { label: 'Publish', detail: 'Publish or archive after the backend confirms the page is not blocked.' },
    ],
  };
  const adminPageUrl = `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/pages/${encodeURIComponent(pageId)}`;
  const publicApiBase = getAdminApiBase().replace(/\/api\/admin$/, '/api');
  const publicRenderUrl = `${publicApiBase}/sites/${encodeURIComponent(siteId)}/render?path=${encodeURIComponent(publicPath)}`;
  const publicResolveUrl = `${publicApiBase}/sites/${encodeURIComponent(siteId)}/resolve?path=${encodeURIComponent(publicPath)}`;
  const editorHandoff = {
    generatedAt: new Date().toISOString(),
    page: {
      id: page.id,
      title: page.title,
      slug: page.slug,
      path: publicPath,
      status: page.status,
      scheduledAt: page.scheduledAt || null,
      isHomepage: Boolean(page.isHomepage),
      routeAvailability: currentRouteConflict
        ? {
            status: 'conflict',
            pageId: currentRouteConflict.id,
            title: currentRouteConflict.title,
            path: getPagePublicPath(currentRouteConflict),
          }
        : {
            status: 'available',
            checkedPages: selectedSitePages.length,
          },
    },
    site: {
      id: siteId,
      name: selectedSite?.name || siteId,
    },
    endpoints: {
      readUpdateDelete: adminPageUrl,
      revisions: `${adminPageUrl}/revisions`,
      readiness: `${adminPageUrl}/readiness`,
      preview: `${adminPageUrl}/preview`,
      publish: `${adminPageUrl}/publish`,
      archive: `${adminPageUrl}/archive`,
      rollback: `${adminPageUrl}/rollback/{revisionId}`,
      publicRender: publicRenderUrl,
      publicResolve: publicResolveUrl,
    },
    canvas: {
      width: initialCanvasSize.width,
      height: initialCanvasSize.height,
      rootLayerCount: elementCount,
      fallbackSeeded: initialElements.length === 0,
      mediaContext: {
        siteId,
        scope: 'page',
        targetId: pageId,
      },
    },
    editorCapabilities: [
      'Drag and resize elements on the page canvas.',
      'Select unlocked sibling layers with Cmd/Ctrl+A, group them with Cmd/Ctrl+G, and ungroup with Shift+Cmd/Ctrl+G.',
      'Save selected elements as reusable sections from the component library.',
      'Use page workspace focus to hide page management panels while designing large canvases.',
      'Bind media, forms, and CMS-ready element props through the inspector.',
      'Persist canvas, settings, route, status, metadata, and revision notes through the page update endpoint.',
    ],
    readiness: {
      score: editorReadiness.score,
      checks: editorReadiness.checks,
      backend: pageReadiness
        ? {
            score: pageReadiness.score,
            statusLabel: pageReadiness.statusLabel,
            elementCount: pageReadiness.elementCount,
            canvasSize: pageReadiness.canvasSize,
          }
        : null,
    },
    revisions: revisions.map((revision) => ({
      id: revision.id,
      note: revision.note,
      createdAt: revision.createdAt,
      status: revision.snapshotStatus,
    })),
    preview: previewUrl
      ? {
          url: previewUrl,
          expiresAt: previewExpiresAt,
        }
      : null,
    guardrails: [
      'Publish is blocked when backend readiness reports blocking errors.',
      'Page settings save is blocked when the edited route collides with another page in the same site.',
      'Saving records a revision snapshot before editor changes are persisted.',
      'Restoring a revision replaces the canvas with a saved backend snapshot.',
      'Frontend renderers should use public resolve/render endpoints and treat admin endpoints as private.',
    ],
  };
  const editorHandoffText = JSON.stringify(editorHandoff, null, 2);

  const copyEditorHandoffText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSaveWarning(null);
      setWorkflowNotice(`${label} copied.`);
    } catch {
      setWorkflowNotice(null);
      setSaveWarning(value);
    }
  };

  const downloadEditorHandoff = () => {
    const blob = new Blob([editorHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${page.slug || page.id}-backy-page-editor-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaveWarning(null);
    setWorkflowNotice('Page editor handoff manifest downloaded.');
  };

  const handleSave = async (
    elements: CanvasElement[],
    settings: PageSettings,
    canvasSize: CanvasSize = initialCanvasSize
  ) => {
    const content = serializeCanvasContent(elements, canvasSize, undefined, {
      documentId: page.id,
      kind: 'page',
      title: settings.title,
      slug: settings.slug,
      status: settings.status,
      locale: 'en',
    });
    try {
      const validationMessage = validatePageSettings(settings);
      if (validationMessage) {
        setSaveWarning(validationMessage);
        throw new Error(validationMessage);
      }

      const savedPage = await updatePageFromApi(siteId, pageId, {
        title: settings.title,
        slug: settings.slug,
        status: settings.status,
        scheduledAt: settings.status === 'scheduled' ? settings.scheduledAt || null : null,
        meta: settings.meta,
        content: parseSerializedContent(content),
        revisionNote: 'Before page editor save',
        updatedBy: 'admin',
      });
      setPage(savedPage);
      updatePage(pageId, savedPage);
      setSaveWarning(null);
      setWorkflowNotice('Page saved and revision snapshot recorded.');
      void loadPageReadiness();
    } catch (error) {
      setSaveWarning(error instanceof Error
        ? `${error.message}. Changes were not persisted.`
        : 'Backend save failed. Changes were not persisted.');
      throw error;
    }
  };

  const handleBack = () => {
    navigate({ to: '/pages', search: { siteId } });
  };

  const applyWorkflow = async (action: 'publish' | 'archive') => {
    setIsWorkflowBusy(true);
    setSaveWarning(null);
    setWorkflowNotice(null);

    try {
      if (action === 'publish') {
        const readiness = await loadPageReadiness();
        if (readiness?.statusLabel === 'blocked') {
          const firstError = readiness.checks.find((check) => check.status !== 'pass' && check.severity === 'error');
          setSaveWarning(firstError?.message || 'Resolve page readiness errors before publishing.');
          return;
        }
      }

      const nextPage = action === 'publish'
        ? await publishPage(siteId, pageId)
        : await archivePage(siteId, pageId);
      setPage(nextPage);
      updatePage(pageId, nextPage);
      setWorkflowNotice(action === 'publish' ? 'Page published.' : 'Page archived.');
      void loadPageReadiness();
    } catch (error) {
      setSaveWarning(error instanceof Error ? error.message : `Unable to ${action} page.`);
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const generatePreview = async () => {
    setIsPreviewBusy(true);
    setSaveWarning(null);

    try {
      const preview = await createPagePreview(siteId, pageId);
      setPreviewUrl(preview.url);
      setPreviewExpiresAt(preview.expiresAt);
      setWorkflowNotice('Preview link created.');
      window.open(preview.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setSaveWarning(error instanceof Error ? error.message : 'Unable to create page preview.');
    } finally {
      setIsPreviewBusy(false);
    }
  };

  const restoreRevision = async (revision: ContentRevision) => {
    setIsWorkflowBusy(true);
    setSaveWarning(null);
    setWorkflowNotice(null);

    try {
      const restoredPage = await rollbackPage(siteId, pageId, revision.id);
      setPage(restoredPage);
      updatePage(pageId, restoredPage);
      setEditorResetVersion((current) => current + 1);
      setWorkflowNotice('Page revision restored.');
      setPendingRestoreRevision(null);
    } catch (error) {
      setSaveWarning(error instanceof Error ? error.message : 'Unable to restore page revision.');
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  return (
    <PageShell
      title={
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg border border-border bg-background p-2 transition-colors hover:bg-accent"
            aria-label="Back to pages"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span>Edit Page</span>
        </div>
      }
      description="Design the public page, manage publishing, and keep revisions in one workspace."
      className="pb-24"
      action={
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsWorkspaceFocus((current) => !current)}
          iconStart={isWorkspaceFocus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        >
          {isWorkspaceFocus ? 'Show page panels' : 'Focus canvas'}
        </Button>
      }
    >
      {(loadError || saveWarning) && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {saveWarning || `${loadError} Using the local page copy.`}
        </div>
      )}

      {workflowNotice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-sm">
          {workflowNotice}
        </div>
      )}

      {!isWorkspaceFocus && (
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="page-editor-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Page editor command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                editorReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {editorReadiness.score}% ready
              </span>
              <StatusBadge status={page.status} />
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control the public page canvas, route, publish state, readiness blockers, revisions, preview links, and frontend handoff from one workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyEditorHandoffText(editorHandoffText, 'Page editor handoff manifest')}
              iconStart={<Copy className="size-4" />}
            >
              Copy handoff
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={downloadEditorHandoff}
              iconStart={<Download className="size-4" />}
            >
              Download JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void generatePreview()}
              disabled={isPreviewBusy}
              iconStart={<Eye className="size-4" />}
            >
              Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadPageReadiness()}
              disabled={readinessLoading}
              iconStart={<RefreshCw className={cn('size-4', readinessLoading && 'animate-spin')} />}
            >
              Refresh readiness
            </Button>
            <Button
              type="button"
              onClick={() => void applyWorkflow('publish')}
              disabled={isWorkflowBusy || page.status === 'published' || isReadinessBlocked}
              iconStart={<CheckCircle2 className="size-4" />}
              title={isReadinessBlocked ? 'Resolve page readiness errors before publishing' : 'Publish page'}
            >
              Publish
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Editor readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks page identity, route, canvas content, SEO metadata, backend readiness, and restore safety.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', editorReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${editorReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {editorReadiness.checks.map((check) => (
                <EditorReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Editor workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {editorReadiness.workflow.map((step, index) => (
                <EditorWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div id="page-editor-handoff" className="mt-4 rounded-lg border border-border bg-background p-4 scroll-mt-24">
          <h3 className="text-sm font-semibold">Page editor control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to the canvas, publish controls, readiness checks, revision history, and frontend handoff details.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {PAGE_EDITOR_CONTROL_AREAS.map((area) => (
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
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <EditorMetaTile label="Site" value={`${selectedSite?.name || siteId} (${siteId})`} />
            <EditorMetaTile label="Route" value={page.slug ? `/${page.slug}` : 'No slug'} />
            <EditorMetaTile label="Canvas" value={`${initialCanvasSize.width} x ${initialCanvasSize.height}px`} />
            <EditorMetaTile label="Elements" value={`${elementCount}`} />
            <EditorMetaTile label="Status" value={page.status} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyEditorHandoffText(adminPageUrl, 'Page editor API URL')}
              iconStart={<Copy className="size-4" />}
            >
              Copy API URL
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyEditorHandoffText(editorHandoffText, 'Page editor handoff manifest')}
              iconStart={<Copy className="size-4" />}
            >
              Copy handoff
            </Button>
          </div>
        </div>
      </section>
      )}

      {isWorkspaceFocus && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm" data-testid="page-editor-focus-banner">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Canvas focus mode</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                Page management panels are hidden so the editor can use the full workspace. Use the editor Focus button to hide component and inspector panels inside the canvas.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsWorkspaceFocus(false)}
              iconStart={<Minimize2 className="size-4" />}
            >
              Show panels
            </Button>
          </div>
        </div>
      )}

      <div className={cn(
        'grid gap-5',
        !isWorkspaceFocus && '[@media(min-width:2200px)]:grid-cols-[minmax(0,1fr)_360px] [@media(min-width:2200px)]:items-start',
      )}
      >
        <div id="page-editor-canvas" className="min-w-0 scroll-mt-24">
          <EditorWorkspaceFrame
            title="Page design canvas"
            description={isWorkspaceFocus
              ? 'Focused page design workspace with the same components, layers, media, grouping, reusable sections, and data bindings.'
              : 'Compose the public page with components, layers, media, grouping, reusable sections, and data bindings.'}
            meta={
              <>
                <span className="rounded bg-muted px-2 py-1 tabular-nums">
                  {initialCanvasSize.width} x {initialCanvasSize.height}px
                </span>
                <span className="rounded bg-muted px-2 py-1">
                  {elementCount} root layer{elementCount === 1 ? '' : 's'}
                </span>
                <span className="rounded bg-muted px-2 py-1">
                  Cmd/Ctrl+G grouping
                </span>
                <span className="rounded bg-muted px-2 py-1">
                  Cmd/Ctrl+A siblings
                </span>
                {isWorkspaceFocus && (
                  <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                    Focused
                  </span>
                )}
              </>
            }
            className={cn(
              'relative',
              isWorkspaceFocus
                ? 'min-h-[calc(100vh-220px)] xl:h-[calc(100vh-220px)] xl:min-h-[calc(100vh-220px)]'
                : 'min-h-[820px] xl:h-[calc(100vh-96px)] xl:min-h-[960px]',
            )}
          >
            <CanvasEditor
              key={`${page.id}:${editorResetVersion}`}
              mode="page"
              initialElements={initialElements.length ? initialElements : fallbackElements}
              initialSize={initialCanvasSize}
              initialSettings={initialSettings}
              onSave={handleSave}
              onBack={handleBack}
              hideNavigation={true}
              mediaContext={{
                siteId,
                scope: 'page',
                targetId: pageId,
                targetLabel: page.title,
              }}
              validateSettings={validatePageSettings}
              className="h-full w-full"
            />
          </EditorWorkspaceFrame>
        </div>

        {!isWorkspaceFocus && (
        <aside className="grid gap-4 lg:grid-cols-3 [@media(min-width:2200px)]:sticky [@media(min-width:2200px)]:top-4 [@media(min-width:2200px)]:block [@media(min-width:2200px)]:space-y-4">
          <Panel id="page-editor-publish" className="scroll-mt-24">
            <PanelHeader
              title="Publish"
              description={page.slug ? `/${page.slug}` : 'Public page'}
              icon={<History className="size-4" />}
              action={<StatusBadge status={page.status} />}
            />
            <PanelContent className="space-y-4">
              <div className="grid gap-2">
                <Button
                  onClick={() => void generatePreview()}
                  disabled={isPreviewBusy}
                  variant="outline"
                  iconStart={<Eye className="size-4" />}
                  className="w-full"
                >
                  Preview
                </Button>
                <Button
                  onClick={() => void applyWorkflow('publish')}
                  disabled={isWorkflowBusy || page.status === 'published' || isReadinessBlocked}
                  variant="primary"
                  iconStart={<CheckCircle2 className="size-4" />}
                  className="w-full"
                  title={isReadinessBlocked ? 'Resolve page readiness errors before publishing' : 'Publish page'}
                >
                  Publish
                </Button>
                <Button
                  onClick={() => void applyWorkflow('archive')}
                  disabled={isWorkflowBusy || page.status === 'archived'}
                  variant="outline"
                  iconStart={<Archive className="size-4" />}
                  className="w-full"
                >
                  Archive
                </Button>
              </div>

              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex max-w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <span className="truncate">
                    Preview expires {previewExpiresAt ? new Date(previewExpiresAt).toLocaleTimeString() : 'soon'}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              )}
            </PanelContent>
          </Panel>

          <Panel id="page-editor-readiness" className="scroll-mt-24">
            <PanelHeader
              title="Readiness"
              description={pageReadiness
                ? `${pageReadiness.elementCount} elements · ${pageReadiness.canvasSize.width}x${pageReadiness.canvasSize.height}`
                : 'Publishing checks'}
              icon={<CheckCircle2 className="size-4" />}
              action={
                <button
                  type="button"
                  onClick={() => void loadPageReadiness()}
                  disabled={readinessLoading}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  title="Refresh page readiness"
                >
                  <RefreshCw className={readinessLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                </button>
              }
            />
            <PanelContent className="space-y-3">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div
                  className={
                    pageReadiness?.statusLabel === 'ready'
                      ? 'text-sm font-semibold text-green-700'
                      : pageReadiness?.statusLabel === 'blocked'
                        ? 'text-sm font-semibold text-red-700'
                        : 'text-sm font-semibold text-amber-700'
                  }
                >
                  {readinessLoading
                    ? 'Checking...'
                    : pageReadiness
                      ? `${pageReadiness.score}% ${pageReadiness.statusLabel.replace('-', ' ')}`
                      : 'Not checked'}
                </div>
                {readinessError && <div className="mt-1 text-xs text-amber-700">{readinessError}</div>}
              </div>

              {pageReadinessFindings.length > 0 ? (
                <div className="grid gap-2">
                  {pageReadinessFindings.map((check) => (
                    <div
                      key={check.id}
                      className={
                        check.severity === 'error'
                          ? 'flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800'
                          : 'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'
                      }
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{check.message}</span>
                    </div>
                  ))}
                </div>
              ) : pageReadiness ? (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready for publishing checks.
                </div>
              ) : null}
            </PanelContent>
          </Panel>

          <Panel id="page-editor-revisions" className="scroll-mt-24">
            <PanelHeader title="Revisions" icon={<RotateCcw className="size-4" />} />
            <PanelContent>
              {revisions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  No saved revisions yet.
                </div>
              ) : (
                <div className="grid gap-2">
                  {revisions.slice(0, 6).map((revision) => (
                    <div key={revision.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{revision.note || 'Revision snapshot'}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(revision.createdAt).toLocaleString()} · {revision.snapshotStatus}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isWorkflowBusy}
                          onClick={() => setPendingRestoreRevision(revision)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title="Restore revision"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelContent>
          </Panel>
        </aside>
        )}
      </div>

      {pendingRestoreRevision && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <RotateCcw className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Restore this page revision?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The canvas will be replaced with this saved page snapshot. Save a new revision first if you need to keep the current design.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">
                {pendingRestoreRevision.note || pendingRestoreRevision.snapshotTitle || 'Revision snapshot'}
              </div>
              <div>
                {new Date(pendingRestoreRevision.createdAt).toLocaleString()} · {pendingRestoreRevision.snapshotStatus}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRestoreRevision(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void restoreRevision(pendingRestoreRevision)}
                disabled={isWorkflowBusy}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
              >
                Restore revision
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function EditorMetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function EditorReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function EditorWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
