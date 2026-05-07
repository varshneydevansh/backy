/**
 * ============================================================================
 * BACKY CMS - PAGE EDITOR ROUTE
 * ============================================================================
 * 
 * Uses the reusable CanvasEditor component with real data persistence.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import { PageSettings } from '@/components/editor/PageSettingsModal';
import { getPage, updatePage as updatePageFromApi } from '@/lib/adminContentApi';
import { useStore, type Page } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
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
      meta: settings.meta,
    };

    try {
      const savedPage = await updatePageFromApi(siteId, pageId, {
        title: settings.title,
        slug: settings.slug,
        status: settings.status,
        meta: settings.meta,
        content: parseSerializedContent(content),
      });
      setPage(savedPage);
      updatePage(pageId, savedPage);
      setSaveWarning(null);
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

  return (
    <div className="relative min-h-screen">
      {(loadError || saveWarning) && (
        <div className="absolute left-1/2 top-3 z-[70] w-[min(720px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {saveWarning || `${loadError} Using the local page copy.`}
        </div>
      )}

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
