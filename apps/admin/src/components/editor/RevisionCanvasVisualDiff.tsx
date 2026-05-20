import type { CanvasElement } from '@/types/editor';
import type { CanvasRevisionElementDiff } from '@/lib/revisionCanvasDiff';

type RevisionCanvasVisualElement = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  depth: number;
};

type RevisionCanvasVisualStatus = 'added' | 'removed' | 'updated' | 'unchanged';

type RevisionCanvasVisualPreviewProps = {
  label: string;
  elements: CanvasElement[];
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  elementDiff: CanvasRevisionElementDiff;
  side: 'snapshot' | 'current';
};

export type RevisionCanvasVisualDiffProps = {
  testId: string;
  snapshotElements: CanvasElement[];
  currentElements: CanvasElement[];
  snapshotCanvasWidth?: number | null;
  snapshotCanvasHeight?: number | null;
  currentCanvasWidth?: number | null;
  currentCanvasHeight?: number | null;
  elementDiff: CanvasRevisionElementDiff;
};

const REVISION_VISUAL_WIDTH = 160;
const REVISION_VISUAL_HEIGHT = 96;
const REVISION_VISUAL_MAX_ELEMENTS = 96;

const visualLabel = (element: CanvasElement): string => {
  const content = element.props?.content;
  return element.name?.trim() || (typeof content === 'string' ? content.trim() : '') || element.type;
};

const flattenVisualElements = (
  elements: CanvasElement[],
  offsetX = 0,
  offsetY = 0,
  depth = 0,
  acc: RevisionCanvasVisualElement[] = [],
): RevisionCanvasVisualElement[] => {
  elements.forEach((element) => {
    const x = offsetX + (Number.isFinite(element.x) ? element.x : 0);
    const y = offsetY + (Number.isFinite(element.y) ? element.y : 0);
    acc.push({
      id: element.id,
      type: element.type,
      label: visualLabel(element),
      x,
      y,
      width: Math.max(1, Number.isFinite(element.width) ? element.width : 1),
      height: Math.max(1, Number.isFinite(element.height) ? element.height : 1),
      zIndex: Number.isFinite(element.zIndex) ? element.zIndex : 0,
      depth,
    });

    if (element.children?.length) {
      flattenVisualElements(element.children, x, y, depth + 1, acc);
    }
  });

  return acc;
};

const visualCanvasSize = (
  elements: RevisionCanvasVisualElement[],
  canvasWidth?: number | null,
  canvasHeight?: number | null,
) => {
  const maxRight = elements.reduce((value, element) => Math.max(value, element.x + element.width), 1);
  const maxBottom = elements.reduce((value, element) => Math.max(value, element.y + element.height), 1);

  return {
    width: canvasWidth && canvasWidth > 0 ? canvasWidth : maxRight,
    height: canvasHeight && canvasHeight > 0 ? canvasHeight : maxBottom,
  };
};

const visualStatusClass = (status: RevisionCanvasVisualStatus): string => {
  if (status === 'added') return 'border-emerald-500 bg-emerald-500/25';
  if (status === 'removed') return 'border-red-500 bg-red-500/25';
  if (status === 'updated') return 'border-amber-500 bg-amber-500/30';
  return 'border-slate-400 bg-slate-400/15';
};

const RevisionCanvasVisualPreview = ({
  label,
  elements,
  canvasWidth,
  canvasHeight,
  elementDiff,
  side,
}: RevisionCanvasVisualPreviewProps) => {
  const visualElements = flattenVisualElements(elements)
    .sort((left, right) => (left.zIndex - right.zIndex) || (left.depth - right.depth))
    .slice(0, REVISION_VISUAL_MAX_ELEMENTS);
  const canvas = visualCanvasSize(visualElements, canvasWidth, canvasHeight);
  const scale = Math.min(REVISION_VISUAL_WIDTH / canvas.width, REVISION_VISUAL_HEIGHT / canvas.height);
  const addedIds = new Set(elementDiff.addedIds);
  const removedIds = new Set(elementDiff.removedIds);
  const updatedIds = new Set(elementDiff.updatedIds);
  const statusForElement = (id: string): RevisionCanvasVisualStatus => {
    if (side === 'snapshot' && removedIds.has(id)) return 'removed';
    if (side === 'current' && addedIds.has(id)) return 'added';
    if (updatedIds.has(id)) return 'updated';
    return 'unchanged';
  };

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{label}</span>
        <span>{visualElements.length} element{visualElements.length === 1 ? '' : 's'}</span>
      </div>
      <div
        className="relative overflow-hidden rounded-md border border-border bg-background"
        style={{ width: REVISION_VISUAL_WIDTH, height: REVISION_VISUAL_HEIGHT }}
      >
        {visualElements.map((element) => {
          const status = statusForElement(element.id);
          const width = Math.max(2, Math.min(REVISION_VISUAL_WIDTH, element.width * scale));
          const height = Math.max(2, Math.min(REVISION_VISUAL_HEIGHT, element.height * scale));
          const left = Math.max(0, Math.min(REVISION_VISUAL_WIDTH - width, element.x * scale));
          const top = Math.max(0, Math.min(REVISION_VISUAL_HEIGHT - height, element.y * scale));

          return (
            <span
              key={element.id}
              className={`absolute rounded-sm border ${visualStatusClass(status)}`}
              style={{ left, top, width, height }}
              title={`${element.label} (${element.type}, ${status})`}
            />
          );
        })}
      </div>
    </div>
  );
};

export const RevisionCanvasVisualDiff = ({
  testId,
  snapshotElements,
  currentElements,
  snapshotCanvasWidth,
  snapshotCanvasHeight,
  currentCanvasWidth,
  currentCanvasHeight,
  elementDiff,
}: RevisionCanvasVisualDiffProps) => (
  <div className="mt-2 border-t border-border/60 pt-2" data-testid={testId}>
    <div className="font-medium text-foreground">Visual canvas diff</div>
    <div className="mt-1 grid gap-2 sm:grid-cols-2">
      <RevisionCanvasVisualPreview
        label="Snapshot"
        elements={snapshotElements}
        canvasWidth={snapshotCanvasWidth}
        canvasHeight={snapshotCanvasHeight}
        elementDiff={elementDiff}
        side="snapshot"
      />
      <RevisionCanvasVisualPreview
        label="Current"
        elements={currentElements}
        canvasWidth={currentCanvasWidth}
        canvasHeight={currentCanvasHeight}
        elementDiff={elementDiff}
        side="current"
      />
    </div>
    <div className="mt-1 flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-emerald-500 bg-emerald-500/25" />Added</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-red-500 bg-red-500/25" />Removed</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-amber-500 bg-amber-500/30" />Updated</span>
    </div>
  </div>
);
