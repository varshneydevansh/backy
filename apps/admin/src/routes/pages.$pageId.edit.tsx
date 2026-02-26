/**
 * ============================================================================
 * BACKY CMS - PAGE EDITOR ROUTE
 * ============================================================================
 * 
 * Uses the reusable CanvasEditor component with real data persistence.
 */

import { useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import { PageSettings } from '@/components/editor/PageSettingsModal';
import { useStore } from '@/stores/mockStore';
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
  const { pages, updatePage } = useStore();

  // Find the page in the store
  const page = pages.find(p => p.id === pageId);

  // If page not found, show error
  if (!page) {
    return (
      <PageShell title="Page Not Found" description="The page you requested doesn't exist.">
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
    // Save to Store
    updatePage(pageId, {
      content: serializeCanvasContent(elements, canvasSize),
      title: settings.title,
      slug: settings.slug,
      status: settings.status,
      meta: settings.meta,
    });
  };

  const handleBack = () => {
    navigate({ to: '/pages' });
  };

  return (
    <CanvasEditor
      mode="page"
      initialElements={initialElements.length ? initialElements : fallbackElements}
      initialSize={initialCanvasSize}
      initialSettings={initialSettings}
      onSave={handleSave}
      onBack={handleBack}
      mediaContext={{
        scope: 'page',
        targetId: pageId,
        targetLabel: page.title,
      }}
    // Pages use fixed layout, so no custom className/width by default
    />
  );
}
