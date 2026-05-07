/**
 * ============================================================================
 * BACKY CMS - PAGE EDITOR ROUTE
 * ============================================================================
 * 
 * Uses the reusable CanvasEditor component with real data persistence.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Archive, CheckCircle2, ExternalLink, Eye, History, RotateCcw } from 'lucide-react';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import { PageSettings } from '@/components/editor/PageSettingsModal';
import {
  archivePage,
  createPagePreview,
  getPage,
  listPageRevisions,
  publishPage,
  rollbackPage,
  updatePage as updatePageFromApi,
  type ContentRevision,
} from '@/lib/adminContentApi';
import { useStore, type Page } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  createCanvasElement,
  normalizeSavedCanvasContent,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

export const Route = createFileRoute('/pages/$pageId/edit')({
  component: PageEditorRoute,
});

function PageEditorRoute() {
  const navigate = useNavigate();
  const { pageId } = Route.useParams();
  const { sites, pages, updatePage } = useStore();
  const storePage = pages.find((candidate) => candidate.id === pageId);
  const storePageId = storePage?.id;
  const storePageSiteId = storePage?.siteId;
  const fallbackSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
  const [page, setPage] = useState<Page | null>(storePage || null);
  const [siteId, setSiteId] = useState(storePage?.siteId || fallbackSiteId);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
  const [isPreviewBusy, setIsPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);

  useEffect(() => {
    let cancelled = false;
    const localFallbackPage = storePage;
    const nextSiteId = storePageSiteId || fallbackSiteId;
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
  }, [fallbackSiteId, pageId, storePageId, storePageSiteId, updatePage]);

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
        <button onClick={() => navigate({ to: '/pages' })} className="text-primary hover:underline">
          &larr; Back to Pages
        </button>
      </PageShell>
    );
  }

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

  // Load Settings
  const initialSettings: PageSettings = {
    title: page.title,
    slug: page.slug,
    status: page.status,
    scheduledAt: page.scheduledAt || null,
    meta: page.meta || { title: page.title, description: '' },
  };

  const handleSave = async (
    elements: CanvasElement[],
    settings: PageSettings,
    canvasSize: CanvasSize = initialCanvasSize
  ) => {
    const content = serializeCanvasContent(elements, canvasSize);
    const localUpdate = {
      content,
      title: settings.title,
      slug: settings.slug,
      status: settings.status,
      scheduledAt: settings.status === 'scheduled' ? settings.scheduledAt || null : null,
      meta: settings.meta,
    };

    try {
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
    } catch (error) {
      updatePage(pageId, localUpdate);
      setPage((current) => current ? { ...current, ...localUpdate } : current);
      setSaveWarning(error instanceof Error
        ? `${error.message}. Changes were kept locally in this browser.`
        : 'Backend save failed. Changes were kept locally in this browser.');
    }
  };

  const handleBack = () => {
    navigate({ to: '/pages' });
  };

  const applyWorkflow = async (action: 'publish' | 'archive') => {
    setIsWorkflowBusy(true);
    setSaveWarning(null);
    setWorkflowNotice(null);

    try {
      const nextPage = action === 'publish'
        ? await publishPage(siteId, pageId)
        : await archivePage(siteId, pageId);
      setPage(nextPage);
      updatePage(pageId, nextPage);
      setWorkflowNotice(action === 'publish' ? 'Page published.' : 'Page archived.');
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
    if (!confirm(`Restore "${revision.snapshotTitle}" from this revision?`)) {
      return;
    }

    setIsWorkflowBusy(true);
    setSaveWarning(null);
    setWorkflowNotice(null);

    try {
      const restoredPage = await rollbackPage(siteId, pageId, revision.id);
      setPage(restoredPage);
      updatePage(pageId, restoredPage);
      setWorkflowNotice('Page revision restored.');
    } catch (error) {
      setSaveWarning(error instanceof Error ? error.message : 'Unable to restore page revision.');
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      {(loadError || saveWarning) && (
        <div className="absolute left-1/2 top-3 z-[70] w-[min(720px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {saveWarning || `${loadError} Using the local page copy.`}
        </div>
      )}

      <div className="absolute right-4 top-3 z-[70] w-[min(360px,calc(100%-2rem))] rounded-lg border border-border bg-background/95 p-3 text-sm shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <History className="h-4 w-4" />
            <span>Workflow</span>
          </div>
          <StatusBadge status={page.status} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={isPreviewBusy}
            onClick={() => void generatePreview()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
          <button
            type="button"
            disabled={isWorkflowBusy || page.status === 'published'}
            onClick={() => void applyWorkflow('publish')}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Publish
          </button>
          <button
            type="button"
            disabled={isWorkflowBusy || page.status === 'archived'}
            onClick={() => void applyWorkflow('archive')}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Archive className="h-4 w-4" />
            Archive
          </button>
        </div>

        {workflowNotice && (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            {workflowNotice}
          </div>
        )}

        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="min-w-0 truncate">
              Preview expires {previewExpiresAt ? new Date(previewExpiresAt).toLocaleTimeString() : 'soon'}
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        )}

        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent revisions</div>
          {revisions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              No saved revisions yet.
            </div>
          ) : (
            revisions.slice(0, 4).map((revision) => (
              <div key={revision.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{revision.note || 'Revision snapshot'}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(revision.createdAt).toLocaleString()} · {revision.snapshotStatus}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isWorkflowBusy}
                    onClick={() => void restoreRevision(revision)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="Restore revision"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <CanvasEditor
        key={`${page.id}:${page.lastUpdated}`}
        mode="page"
        initialElements={initialElements.length ? initialElements : fallbackElements}
        initialSize={initialCanvasSize}
        initialSettings={initialSettings}
        onSave={handleSave}
        onBack={handleBack}
        mediaContext={{
          siteId,
          scope: 'page',
          targetId: pageId,
          targetLabel: page.title,
        }}
      // Pages use fixed layout, so no custom className/width by default
      />
    </div>
  );
}
