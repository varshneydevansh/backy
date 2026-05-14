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
  AdminContentApiError,
  archivePage,
  createPagePreview,
  getAdminApiBase,
  getPage,
  getPageReadiness,
  getUserPermissions,
  listPages,
  listPageRevisions,
  publishPage,
  rollbackPage,
  updatePage as updatePageFromApi,
  type AdminUserPermissionMatrix,
  type ContentRevision,
  type PageReadiness,
} from '@/lib/adminContentApi';
import { useStore, type Page } from '@/stores/mockStore';
import { useAuthStore, type User } from '@/stores/authStore';
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

interface PageEditorSearch {
  siteId?: string;
  focus?: 'canvas';
}

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/pages/$pageId/edit')({
  validateSearch: (search: Record<string, unknown>): PageEditorSearch => ({
    siteId: normalizedSearchString(search.siteId),
    focus: search.focus === 'canvas' ? 'canvas' : undefined,
  }),
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
  page.isHomepage || page.slug === 'index' || page.slug === 'home' || page.slug === ''
    ? '/'
    : `/${slugify(page.slug)}`
);

type CanvasTreeStats = {
  rootLayerCount: number;
  totalLayerCount: number;
  containerLayerCount: number;
  maxDepth: number;
};

type PageSaveConflict = {
  expectedUpdatedAt?: string;
  currentUpdatedAt?: string;
};

type PageEditorPermissionKey =
  | 'pages.view'
  | 'pages.edit'
  | 'pages.publish'
  | 'pages.delete'
  | 'media.view'
  | 'media.create'
  | 'collections.view';

const PAGE_EDITOR_PERMISSION_ROLE_DEFAULTS: Record<PageEditorPermissionKey, Array<User['role']>> = {
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'pages.publish': ['owner', 'admin', 'editor'],
  'pages.delete': ['owner', 'admin'],
  'media.view': ['owner', 'admin', 'editor', 'viewer'],
  'media.create': ['owner', 'admin', 'editor'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
};

const pageEditorPermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: PageEditorPermissionKey,
) => permissionMatrix?.groups
  .flatMap((group) => group.permissions)
  .find((permission) => permission.key === key) || null;

const isPageEditorPermissionAllowed = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: User | null,
  key: PageEditorPermissionKey,
): boolean => {
  const matrixRule = pageEditorPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.allowed;

  return Boolean(currentAdmin && PAGE_EDITOR_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role));
};

const pageEditorPermissionReason = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: User | null,
  key: PageEditorPermissionKey,
): string => {
  const matrixRule = pageEditorPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.reason;
  if (!currentAdmin) return 'Sign in with an admin account to use this capability.';

  return PAGE_EDITOR_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)
    ? `Allowed by ${currentAdmin.role} role defaults.`
    : `Blocked by ${currentAdmin.role} role defaults.`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const getCanvasTreeStats = (elements: CanvasElement[]): CanvasTreeStats => {
  let totalLayerCount = 0;
  let containerLayerCount = 0;
  let maxDepth = 0;

  const visit = (nodes: CanvasElement[], depth: number) => {
    nodes.forEach((element) => {
      totalLayerCount += 1;
      maxDepth = Math.max(maxDepth, depth);

      if (element.children?.length) {
        containerLayerCount += 1;
        visit(element.children, depth + 1);
      }
    });
  };

  visit(elements, elements.length > 0 ? 1 : 0);

  return {
    rootLayerCount: elements.length,
    totalLayerCount,
    containerLayerCount,
    maxDepth,
  };
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function PageEditorRoute() {
  const navigate = useNavigate();
  const { pageId } = Route.useParams();
  const routeSearch = Route.useSearch();
  const { sites, pages, updatePage } = useStore();
  const currentAdmin = useAuthStore((store) => store.user);
  const storePage = pages.find((candidate) => candidate.id === pageId);
  const storePageId = storePage?.id;
  const storePageSiteId = storePage?.siteId;
  const requestedSite = routeSearch.siteId
    ? sites.find((site) => siteMatchesIdentifier(site, routeSearch.siteId || ''))
    : undefined;
  const requestedSiteId = requestedSite?.publicSiteId || requestedSite?.id || routeSearch.siteId || getSiteSelectionFromSearch(sites);
  const storePageSite = storePageSiteId
    ? sites.find((site) => siteMatchesIdentifier(site, storePageSiteId))
    : undefined;
  const fallbackSiteId = storePageSite?.publicSiteId || storePageSite?.id || requestedSiteId || 'site-demo';
  const [page, setPage] = useState<Page | null>(storePage || null);
  const [siteId, setSiteId] = useState(storePageSite?.publicSiteId || storePageSite?.id || storePage?.siteId || fallbackSiteId);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState<PageSaveConflict | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
  const [isPreviewBusy, setIsPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [pageReadiness, setPageReadiness] = useState<PageReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [editorHasUnsavedChanges, setEditorHasUnsavedChanges] = useState(false);
  const [editorResetVersion, setEditorResetVersion] = useState(0);
  const [pendingRestoreRevision, setPendingRestoreRevision] = useState<ContentRevision | null>(null);
  const [isWorkspaceFocus, setIsWorkspaceFocus] = useState(routeSearch.focus === 'canvas');
  const [routeCheckPages, setRouteCheckPages] = useState<Page[] | null>(null);
  const [routeCheckSiteId, setRouteCheckSiteId] = useState<string | null>(null);
  const [routeCheckError, setRouteCheckError] = useState<string | null>(null);
  const [isRouteCheckLoading, setIsRouteCheckLoading] = useState(false);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewPage = !isPermissionMatrixPending && isPageEditorPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view');
  const canEditPage = !isPermissionMatrixPending && isPageEditorPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit');
  const canPublishPage = !isPermissionMatrixPending && isPageEditorPermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish');
  const canDeletePage = !isPermissionMatrixPending && isPageEditorPermissionAllowed(permissionMatrix, currentAdmin, 'pages.delete');
  const canViewMedia = !isPermissionMatrixPending && isPageEditorPermissionAllowed(permissionMatrix, currentAdmin, 'media.view');
  const canCreateMedia = !isPermissionMatrixPending && isPageEditorPermissionAllowed(permissionMatrix, currentAdmin, 'media.create');
  const canViewCollections = !isPermissionMatrixPending && isPageEditorPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view');
  const viewPagePermissionTitle = canViewPage ? undefined : pageEditorPermissionReason(permissionMatrix, currentAdmin, 'pages.view');
  const editPagePermissionTitle = canEditPage ? undefined : pageEditorPermissionReason(permissionMatrix, currentAdmin, 'pages.edit');
  const publishPagePermissionTitle = canPublishPage ? undefined : pageEditorPermissionReason(permissionMatrix, currentAdmin, 'pages.publish');
  const deletePagePermissionTitle = canDeletePage ? undefined : pageEditorPermissionReason(permissionMatrix, currentAdmin, 'pages.delete');
  const viewMediaPermissionTitle = canViewMedia ? undefined : pageEditorPermissionReason(permissionMatrix, currentAdmin, 'media.view');
  const createMediaPermissionTitle = canCreateMedia ? undefined : pageEditorPermissionReason(permissionMatrix, currentAdmin, 'media.create');
  const viewCollectionsPermissionTitle = canViewCollections ? undefined : pageEditorPermissionReason(permissionMatrix, currentAdmin, 'collections.view');
  const editPageDeniedMessage = `Your account needs pages.edit to change this page. ${editPagePermissionTitle}`;
  const publishPageDeniedMessage = `Your account needs pages.publish to preview or publish this page. ${publishPagePermissionTitle}`;
  const isPageEditorWorkflowBusy = isWorkflowBusy || isPreviewBusy || readinessLoading;
  const isPageEditorSaveBusy = isLoadingPage || isWorkflowBusy || isPreviewBusy;
  const isPageEditorBusy = isLoadingPage || isPageEditorWorkflowBusy || isPermissionMatrixPending;

  useEffect(() => {
    let cancelled = false;

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setPermissionError('Sign in with an admin account to load page editor permissions.');
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
      .catch((error) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(error instanceof Error ? error.message : 'Unable to load page editor permissions.');
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
    let cancelled = false;
    const localFallbackPage = storePage;
    const nextSiteId = storePageSite?.publicSiteId || storePageSite?.id || storePageSiteId || fallbackSiteId;
    setSiteId(nextSiteId);

    const loadPage = async () => {
      if (isPermissionMatrixPending) {
        return;
      }

      if (!canViewPage) {
        setIsLoadingPage(false);
        setLoadError(viewPagePermissionTitle || 'Your account cannot view this page.');
        setPage(null);
        return;
      }

      setIsLoadingPage(true);
      setLoadError(null);

      try {
        let backendPage: Page | null = null;
        let lastError: unknown = null;

        for (const delayMs of [0, 200, 600]) {
          if (delayMs > 0) {
            await sleep(delayMs);
          }
          if (cancelled) {
            return;
          }

          try {
            backendPage = await getPage(nextSiteId, pageId);
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!backendPage) {
          throw lastError || new Error('Unable to load page.');
        }

        if (!cancelled) {
          setPage(backendPage);
          updatePage(pageId, backendPage);
          setSaveConflict(null);
        }
      } catch (error) {
        if (!cancelled) {
          const deniedByBackend = error instanceof Error && /permission|forbidden|unauthori[sz]ed/i.test(error.message);
          if (localFallbackPage && !deniedByBackend) {
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
  }, [canViewPage, fallbackSiteId, isPermissionMatrixPending, pageId, storePageId, storePageSite?.id, storePageSite?.publicSiteId, storePageSiteId, updatePage, viewPagePermissionTitle]);

  useEffect(() => {
    if (!page || !canViewPage) {
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
  }, [canViewPage, page, pageId, siteId]);

  useEffect(() => {
    if (!canViewPage || isPermissionMatrixPending) {
      setRouteCheckPages(null);
      setRouteCheckSiteId(null);
      setRouteCheckError(null);
      setIsRouteCheckLoading(false);
      return;
    }

    let cancelled = false;

    setRouteCheckPages(null);
    setRouteCheckSiteId(null);
    setRouteCheckError(null);
    setIsRouteCheckLoading(true);

    listPages(siteId)
      .then((backendPages) => {
        if (!cancelled) {
          setRouteCheckPages(backendPages);
          setRouteCheckSiteId(siteId);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRouteCheckPages(null);
          setRouteCheckError(error instanceof Error ? error.message : 'Unable to verify page routes.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRouteCheckLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canViewPage, isPermissionMatrixPending, siteId]);

  const loadPageReadiness = async () => {
    if (!page) {
      return null;
    }
    if (!canViewPage) {
      setReadinessError(viewPagePermissionTitle || 'Your account cannot view page readiness.');
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
  }, [page?.id, siteId, canViewPage]);

  useEffect(() => {
    setIsWorkspaceFocus(routeSearch.focus === 'canvas');
  }, [routeSearch.focus]);

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

  const editorElements = initialElements.length ? initialElements : fallbackElements;
  const canvasTreeStats = useMemo(() => getCanvasTreeStats(editorElements), [editorElements]);

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

  if (!canViewPage && !isPermissionMatrixPending) {
    return (
      <PageShell title="Page access denied" description={viewPagePermissionTitle || permissionError || "Your account can't view this page."}>
        <button onClick={() => navigate({ to: '/pages', search: { siteId } })} className="text-primary hover:underline">
          &larr; Back to Pages
        </button>
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
  const elementCount = canvasTreeStats.rootLayerCount;
  const totalElementCount = canvasTreeStats.totalLayerCount;
  const containerLayerCount = canvasTreeStats.containerLayerCount;
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
  const localSelectedSitePages = pages.filter((candidate) => selectedSiteIdentifiers.has(candidate.siteId));
  const siteRouteCheckPages = routeCheckSiteId === siteId ? routeCheckPages : null;
  const selectedSitePages = siteRouteCheckPages || localSelectedSitePages;
  const isRouteCheckBackendVerified = Boolean(siteRouteCheckPages);
  const routeCheckBlockedMessage = !isRouteCheckBackendVerified
    ? isRouteCheckLoading
      ? 'Checking backend page routes before confirming availability.'
      : routeCheckError
        ? `Unable to verify route against backend pages: ${routeCheckError}`
        : 'Load backend page routes before confirming availability.'
    : null;
  const getPublicPathForSettings = (settings: PageSettings) => (
    page.isHomepage || settings.slug === 'index' || settings.slug === 'home' || settings.slug.trim() === ''
      ? '/'
      : `/${slugify(settings.slug || settings.title || 'page')}`
  );
  const findRouteConflict = (settings: PageSettings) => {
    const nextPath = getPublicPathForSettings(settings);

    return selectedSitePages.find((candidate) => candidate.id !== page.id && getPagePublicPath(candidate) === nextPath) || null;
  };
  const currentRouteConflict = findRouteConflict(initialSettings);
  const publishDisabledReason = currentRouteConflict
    ? `${publicPath} conflicts with "${currentRouteConflict.title}". Choose another slug before publishing.`
    : routeCheckBlockedMessage
      ? routeCheckBlockedMessage
    : isReadinessBlocked
      ? pageReadinessFindings.find((check) => check.severity === 'error')?.message || 'Resolve page readiness errors before publishing.'
      : null;
  const editorPublishDisabledReason = !canPublishPage ? publishPageDeniedMessage : publishDisabledReason;
  const externalWorkflowDisabledReason = !canPublishPage
    ? publishPageDeniedMessage
    : editorHasUnsavedChanges
    ? 'Save the canvas before previewing, publishing, archiving, or restoring from the page panels.'
    : publishDisabledReason;
  const archiveDisabledReason = !canEditPage
    ? editPageDeniedMessage
    : editorHasUnsavedChanges
      ? 'Save the canvas before archiving from this panel'
      : null;
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

    if (routeCheckBlockedMessage) {
      return routeCheckBlockedMessage;
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
        : routeCheckBlockedMessage
          ? routeCheckBlockedMessage
        : `${publicPath} is unique across ${selectedSitePages.length} page${selectedSitePages.length === 1 ? '' : 's'} in this site.`,
      ready: !currentRouteConflict && isRouteCheckBackendVerified,
    },
    {
      label: 'Canvas content',
      detail: totalElementCount > 0
        ? `${totalElementCount} total layer${totalElementCount === 1 ? '' : 's'} across ${elementCount} root layer${elementCount === 1 ? '' : 's'}.`
        : 'Add at least one element to the page.',
      ready: totalElementCount > 0,
    },
    {
      label: 'Nested layout',
      detail: containerLayerCount > 0
        ? `${containerLayerCount} container/group layer${containerLayerCount === 1 ? '' : 's'} support nested editing.`
        : 'No grouped or nested containers yet.',
      ready: true,
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
        : routeCheckBlockedMessage
          ? {
              status: 'unverified',
              reason: routeCheckBlockedMessage,
              checkedPages: selectedSitePages.length,
            }
        : {
            status: 'available',
            source: 'backend',
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
      rollback: `${adminPageUrl}/rollback`,
      rollbackMethod: 'POST',
      rollbackBody: { revisionId: '{revisionId}' },
      publicRender: publicRenderUrl,
      publicResolve: publicResolveUrl,
    },
    canvas: {
      width: initialCanvasSize.width,
      height: initialCanvasSize.height,
      rootLayerCount: elementCount,
      totalLayerCount: totalElementCount,
      containerLayerCount,
      maxDepth: canvasTreeStats.maxDepth,
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
    if (isPageEditorBusy) return;

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
    if (isPageEditorBusy) return;

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
    if (isPageEditorSaveBusy) {
      const message = 'Wait for the page load, preview, publish, archive, or restore workflow before saving.';
      setSaveWarning(message);
      throw new Error(message);
    }

    if (!canEditPage) {
      setSaveWarning(editPageDeniedMessage);
      throw new Error(editPageDeniedMessage);
    }

    try {
      const validationMessage = validatePageSettings(settings);
      if (validationMessage) {
        setSaveWarning(validationMessage);
        throw new Error(validationMessage);
      }

      if (settings.status === 'published' && page.status !== 'published' && publishDisabledReason) {
        setSaveWarning(publishDisabledReason);
        throw new Error(publishDisabledReason);
      }

      if ((settings.status === 'published' || settings.status === 'scheduled') && page.status !== settings.status && !canPublishPage) {
        setSaveWarning(publishPageDeniedMessage);
        throw new Error(publishPageDeniedMessage);
      }

      const shouldPublishThroughWorkflow = settings.status === 'published' && page.status !== 'published';
      const statusForSave = shouldPublishThroughWorkflow ? 'draft' : settings.status;
      const content = serializeCanvasContent(elements, canvasSize, undefined, {
        documentId: page.id,
        kind: 'page',
        title: settings.title,
        slug: settings.slug,
        status: statusForSave,
        locale: 'en',
      });
      const savedPage = await updatePageFromApi(siteId, pageId, {
        title: settings.title,
        slug: settings.slug,
        status: statusForSave,
        scheduledAt: statusForSave === 'scheduled' ? settings.scheduledAt || null : null,
        meta: settings.meta,
        content: parseSerializedContent(content),
        revisionNote: 'Before page editor save',
        updatedBy: 'admin',
        expectedUpdatedAt: page.lastUpdated,
      });
      const nextPage = shouldPublishThroughWorkflow
        ? await publishPage(siteId, pageId, { expectedUpdatedAt: savedPage.lastUpdated })
        : savedPage;
      setPage(nextPage);
      setRouteCheckPages((currentPages) => currentPages?.map((candidate) => (
        candidate.id === nextPage.id ? nextPage : candidate
      )) || currentPages);
      setRouteCheckSiteId(siteId);
      updatePage(pageId, nextPage);
      setSaveConflict(null);
      setSaveWarning(null);
      setWorkflowNotice(shouldPublishThroughWorkflow
        ? 'Page saved and published through readiness checks.'
        : 'Page saved and revision snapshot recorded.');
      void loadPageReadiness();
    } catch (error) {
      if (error instanceof AdminContentApiError && error.code === 'PAGE_VERSION_CONFLICT') {
        const details = isRecord(error.details) ? error.details : {};
        const expectedUpdatedAt = typeof details.expectedUpdatedAt === 'string' ? details.expectedUpdatedAt : page.lastUpdated;
        const currentUpdatedAt = typeof details.currentUpdatedAt === 'string' ? details.currentUpdatedAt : undefined;
        setSaveConflict({ expectedUpdatedAt, currentUpdatedAt });
        setSaveWarning('This page changed after the editor loaded it. Reload the latest backend copy before saving again.');
      } else {
        setSaveConflict(null);
        setSaveWarning(error instanceof Error
          ? `${error.message}. Changes were not persisted.`
          : 'Backend save failed. Changes were not persisted.');
      }
      throw error;
    }
  };

  const reloadLatestPage = async () => {
    if (isPageEditorBusy) return;
    if (!canViewPage) {
      setSaveWarning(viewPagePermissionTitle || 'Your account cannot reload this page.');
      return;
    }

    setIsLoadingPage(true);
    setSaveWarning(null);
    setWorkflowNotice(null);
    try {
      const latestPage = await getPage(siteId, pageId);
      setPage(latestPage);
      updatePage(pageId, latestPage);
      setEditorResetVersion((version) => version + 1);
      setEditorHasUnsavedChanges(false);
      setSaveConflict(null);
      setWorkflowNotice('Latest backend page loaded into the editor.');
      void loadPageReadiness();
    } catch (error) {
      setSaveWarning(error instanceof Error ? error.message : 'Unable to reload the latest page.');
    } finally {
      setIsLoadingPage(false);
    }
  };

  const handleBack = () => {
    if (isPageEditorBusy) return;

    navigate({ to: '/pages', search: { siteId } });
  };

  const setWorkspaceFocusRoute = (focused: boolean) => {
    if (isPageEditorBusy) return;

    setIsWorkspaceFocus(focused);
    navigate({
      to: '/pages/$pageId/edit',
      params: { pageId },
      search: {
        siteId,
        ...(focused ? { focus: 'canvas' as const } : {}),
      },
      replace: true,
    });
  };

  const applyWorkflow = async (action: 'publish' | 'archive') => {
    if (isPageEditorBusy) return;
    if (action === 'publish' && !canPublishPage) {
      setSaveWarning(publishPageDeniedMessage);
      return;
    }
    if (action === 'archive' && !canEditPage) {
      setSaveWarning(editPageDeniedMessage);
      return;
    }

    setIsWorkflowBusy(true);
    setSaveWarning(null);
    setWorkflowNotice(null);

    try {
      if (editorHasUnsavedChanges) {
        setSaveWarning('Save the canvas before changing the page publishing state from the page panels.');
        return;
      }

      if (action === 'publish') {
        const readiness = await loadPageReadiness();
        if (readiness?.statusLabel === 'blocked') {
          const firstError = readiness.checks.find((check) => check.status !== 'pass' && check.severity === 'error');
          setSaveWarning(firstError?.message || 'Resolve page readiness errors before publishing.');
          return;
        }
      }

      const nextPage = action === 'publish'
        ? await publishPage(siteId, pageId, { expectedUpdatedAt: page.lastUpdated })
        : await archivePage(siteId, pageId, { expectedUpdatedAt: page.lastUpdated });
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
    if (isPageEditorBusy) return;
    if (!canPublishPage) {
      setSaveWarning(publishPageDeniedMessage);
      return;
    }

    setIsPreviewBusy(true);
    setSaveWarning(null);

    try {
      if (editorHasUnsavedChanges) {
        setSaveWarning('Save the canvas before generating a page preview.');
        return;
      }

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
    if (isPageEditorBusy) return;
    if (!canEditPage) {
      setSaveWarning(editPageDeniedMessage);
      return;
    }

    setIsWorkflowBusy(true);
    setSaveWarning(null);
    setWorkflowNotice(null);

    try {
      if (editorHasUnsavedChanges) {
        setSaveWarning('Save or reload the canvas before restoring a revision.');
        return;
      }

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
            disabled={isPageEditorBusy}
            className="rounded-lg border border-border bg-background p-2 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Back to pages"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span>Edit Page</span>
        </div>
      }
      description="Design the public page, manage publishing, and keep revisions in one workspace."
      className={cn(
        isWorkspaceFocus
          ? 'h-[calc(100vh-1rem)] overflow-hidden pb-0 lg:h-[calc(100vh-1.5rem)]'
          : 'pb-24',
      )}
      contentClassName={isWorkspaceFocus ? 'h-full min-h-0' : undefined}
      hideHeader={isWorkspaceFocus}
      action={
        <Button
          type="button"
          variant="outline"
          onClick={() => setWorkspaceFocusRoute(!isWorkspaceFocus)}
          disabled={isPageEditorBusy}
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

      {(permissionError || isPermissionMatrixPending) && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm">
          {isPermissionMatrixPending ? 'Loading page editor permissions...' : permissionError}
        </div>
      )}

      {saveConflict && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm sm:flex-row sm:items-start sm:justify-between"
          data-testid="page-editor-save-conflict"
        >
          <div>
            <div className="font-semibold">Save conflict detected</div>
            <div className="mt-1 text-xs leading-5">
              The backend page was updated after this editor loaded. Your save was blocked so newer content is not overwritten.
            </div>
            <dl className="mt-2 grid gap-1 text-[11px] text-red-800 sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Editor copy</dt>
                <dd className="font-mono">{saveConflict.expectedUpdatedAt || 'unknown'}</dd>
              </div>
              <div>
                <dt className="font-semibold">Backend copy</dt>
                <dd className="font-mono">{saveConflict.currentUpdatedAt || 'unknown'}</dd>
              </div>
            </dl>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void reloadLatestPage()}
            disabled={isPageEditorBusy}
            data-testid="page-editor-conflict-reload"
            iconStart={<RefreshCw className="size-4" />}
          >
            Reload latest
          </Button>
        </div>
      )}

      {workflowNotice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-sm">
          {workflowNotice}
        </div>
      )}

      {editorHasUnsavedChanges && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-semibold">Unsaved canvas changes</div>
            <div className="mt-1 text-xs leading-5">
              Save from the editor toolbar before using page-panel preview, publish, archive, or revision restore actions.
            </div>
          </div>
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
              disabled={isPageEditorBusy}
              iconStart={<Copy className="size-4" />}
            >
              Copy handoff
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={downloadEditorHandoff}
              disabled={isPageEditorBusy}
              iconStart={<Download className="size-4" />}
            >
              Download JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void generatePreview()}
              disabled={isPageEditorBusy || editorHasUnsavedChanges || !canPublishPage}
              iconStart={<Eye className="size-4" />}
              title={!canPublishPage ? publishPagePermissionTitle : editorHasUnsavedChanges ? 'Save the canvas before generating a preview' : 'Preview page'}
            >
              Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadPageReadiness()}
              disabled={isPageEditorBusy || !canViewPage}
              title={canViewPage ? 'Refresh readiness' : viewPagePermissionTitle}
              iconStart={<RefreshCw className={cn('size-4', readinessLoading && 'animate-spin')} />}
            >
              Refresh readiness
            </Button>
            <Button
              type="button"
              onClick={() => void applyWorkflow('publish')}
              disabled={isPageEditorBusy || page.status === 'published' || Boolean(externalWorkflowDisabledReason)}
              iconStart={<CheckCircle2 className="size-4" />}
              title={externalWorkflowDisabledReason || 'Publish page'}
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
                aria-disabled={isPageEditorBusy}
                onClick={(event) => {
                  if (isPageEditorBusy) event.preventDefault();
                }}
                className={cn(
                  'rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5',
                  isPageEditorBusy && 'pointer-events-none opacity-60',
                )}
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
            <EditorMetaTile label="Layers" value={`${totalElementCount} total / ${elementCount} root`} />
            <EditorMetaTile label="Status" value={page.status} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyEditorHandoffText(adminPageUrl, 'Page editor API URL')}
              disabled={isPageEditorBusy}
              iconStart={<Copy className="size-4" />}
            >
              Copy API URL
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyEditorHandoffText(editorHandoffText, 'Page editor handoff manifest')}
              disabled={isPageEditorBusy}
              iconStart={<Copy className="size-4" />}
            >
              Copy handoff
            </Button>
          </div>
        </div>
      </section>
      )}

      <div className={cn(
        'grid gap-5',
        isWorkspaceFocus && 'h-full min-h-0',
        !isWorkspaceFocus && '[@media(min-width:2200px)]:grid-cols-[minmax(0,1fr)_360px] [@media(min-width:2200px)]:items-start',
      )}
      >
        <div id="page-editor-canvas" className={cn('min-w-0 scroll-mt-24', isWorkspaceFocus && 'h-full min-h-0')}>
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
                  {totalElementCount} layer{totalElementCount === 1 ? '' : 's'} / {elementCount} root
                </span>
                <span className="rounded bg-muted px-2 py-1">
                  {containerLayerCount} container{containerLayerCount === 1 ? '' : 's'}
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
            actions={isWorkspaceFocus ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWorkspaceFocusRoute(false)}
                disabled={isPageEditorBusy}
                iconStart={<Minimize2 className="size-4" />}
              >
                Show panels
              </Button>
            ) : undefined}
            data-testid={isWorkspaceFocus ? 'page-editor-focus-banner' : undefined}
            className={cn(
              'relative',
              isWorkspaceFocus
                ? 'h-full min-h-0'
                : 'min-h-[820px] xl:h-[calc(100vh-72px)] xl:min-h-[920px]',
            )}
          >
            <CanvasEditor
              key={`${page.id}:${editorResetVersion}`}
              mode="page"
              initialElements={editorElements}
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
              canView={canViewPage}
              canEdit={canEditPage}
              canPublish={canPublishPage}
              canViewMedia={canViewMedia}
              canCreateMedia={canCreateMedia}
              canViewCollections={canViewCollections}
              canDeleteReusableSections={canDeletePage}
              editDisabledReason={editPagePermissionTitle}
              publishDisabled={Boolean(editorPublishDisabledReason)}
              publishDisabledReason={editorPublishDisabledReason || undefined}
              mediaViewDisabledReason={viewMediaPermissionTitle}
              mediaCreateDisabledReason={createMediaPermissionTitle}
              collectionsViewDisabledReason={viewCollectionsPermissionTitle}
              reusableDeleteDisabledReason={deletePagePermissionTitle}
              onUnsavedChangesChange={setEditorHasUnsavedChanges}
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
              {editorHasUnsavedChanges && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Save the canvas from the editor toolbar before using these page-panel workflows.</span>
                </div>
              )}

              <div className="grid gap-2">
                <Button
                  onClick={() => void generatePreview()}
                  disabled={isPageEditorBusy || editorHasUnsavedChanges || !canPublishPage}
                  variant="outline"
                  iconStart={<Eye className="size-4" />}
                  className="w-full"
                  title={!canPublishPage ? publishPagePermissionTitle : editorHasUnsavedChanges ? 'Save the canvas before generating a preview' : 'Preview page'}
                >
                  Preview
                </Button>
                <Button
                  onClick={() => void applyWorkflow('publish')}
                  disabled={isPageEditorBusy || page.status === 'published' || Boolean(externalWorkflowDisabledReason)}
                  variant="primary"
                  iconStart={<CheckCircle2 className="size-4" />}
                  className="w-full"
                  title={externalWorkflowDisabledReason || 'Publish page'}
                >
                  Publish
                </Button>
                <Button
                  onClick={() => void applyWorkflow('archive')}
                  disabled={isPageEditorBusy || page.status === 'archived' || Boolean(archiveDisabledReason)}
                  variant="outline"
                  iconStart={<Archive className="size-4" />}
                  className="w-full"
                  title={archiveDisabledReason || 'Archive page'}
                >
                  Archive
                </Button>
              </div>

              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={isPageEditorBusy}
                  onClick={(event) => {
                    if (isPageEditorBusy) event.preventDefault();
                  }}
                  className={cn(
                    'flex max-w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground',
                    isPageEditorBusy && 'pointer-events-none opacity-60',
                  )}
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
                  disabled={isPageEditorBusy || !canViewPage}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title={canViewPage ? 'Refresh page readiness' : viewPagePermissionTitle}
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
            <PanelContent className="space-y-3">
              {editorHasUnsavedChanges && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Save the current canvas before restoring a saved revision.</span>
                </div>
              )}

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
                          disabled={isPageEditorBusy || editorHasUnsavedChanges || !canEditPage}
                          onClick={() => setPendingRestoreRevision(revision)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          title={!canEditPage ? editPagePermissionTitle : editorHasUnsavedChanges ? 'Save or reload the canvas before restoring' : 'Restore revision'}
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
                disabled={isPageEditorBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void restoreRevision(pendingRestoreRevision)}
                disabled={isPageEditorBusy || editorHasUnsavedChanges || !canEditPage}
                title={canEditPage ? undefined : editPagePermissionTitle}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWorkflowBusy ? 'Restoring...' : 'Restore revision'}
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
