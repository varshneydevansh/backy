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
  changeIndexById: Map<string, number>;
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
  changeIndexById,
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
          const changeIndex = status === 'unchanged' ? undefined : changeIndexById.get(element.id);
          const width = Math.max(2, Math.min(REVISION_VISUAL_WIDTH, element.width * scale));
          const height = Math.max(2, Math.min(REVISION_VISUAL_HEIGHT, element.height * scale));
          const left = Math.max(0, Math.min(REVISION_VISUAL_WIDTH - width, element.x * scale));
          const top = Math.max(0, Math.min(REVISION_VISUAL_HEIGHT - height, element.y * scale));
          const markerLeft = Math.max(0, Math.min(REVISION_VISUAL_WIDTH - 14, left + width / 2 - 7));
          const markerTop = Math.max(0, Math.min(REVISION_VISUAL_HEIGHT - 14, top + height / 2 - 7));

          return (
            <span key={element.id}>
              <span
                className={`absolute rounded-sm border ${visualStatusClass(status)}`}
                style={{ left, top, width, height }}
                title={`${element.label} (${element.type}, ${status})`}
              />
              {changeIndex ? (
                <span
                  className="absolute flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground text-[9px] font-bold leading-none text-background"
                  style={{ left: markerLeft, top: markerTop }}
                  title={`${changeIndex}. ${element.label} (${element.type}, ${status})`}
                >
                  {changeIndex}
                </span>
              ) : null}
            </span>
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
}: RevisionCanvasVisualDiffProps) => {
  const changeIndexById = new Map(elementDiff.changes.map((change, index) => [change.id, index + 1]));

  return (
    <div className="mt-2 border-t border-border/60 pt-2" data-testid={testId}>
      <div className="font-medium text-foreground">Visual canvas diff</div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <RevisionCanvasVisualPreview
          label="Snapshot"
          elements={snapshotElements}
          canvasWidth={snapshotCanvasWidth}
          canvasHeight={snapshotCanvasHeight}
          elementDiff={elementDiff}
          changeIndexById={changeIndexById}
          side="snapshot"
        />
        <RevisionCanvasVisualPreview
          label="Current"
          elements={currentElements}
          canvasWidth={currentCanvasWidth}
          canvasHeight={currentCanvasHeight}
          elementDiff={elementDiff}
          changeIndexById={changeIndexById}
          side="current"
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-emerald-500 bg-emerald-500/25" />Added</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-red-500 bg-red-500/25" />Removed</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-amber-500 bg-amber-500/30" />Updated</span>
      </div>
      {elementDiff.changes.length ? (
        <div className="mt-2 grid gap-1" data-testid={`${testId}-focus`}>
          <div className="font-medium text-foreground">Visual diff focus</div>
          {elementDiff.changes.map((change, index) => (
            <div key={change.id} className="grid gap-1 border-t border-border/60 pt-1 first:border-t-0">
              <div className="flex flex-wrap items-center gap-1 text-foreground">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-bold leading-none text-background">{index + 1}</span>
                <span className="font-semibold capitalize">{change.kind}</span>
                <span className="font-mono">{change.type}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{change.label}</span>
              </div>
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <span className="text-muted-foreground">Path </span>
                <span>{change.path}</span>
                <span className="text-muted-foreground"> · </span>
                <span>{change.propertyChangeCount} propert{change.propertyChangeCount === 1 ? 'y' : 'ies'}</span>
              </div>
            </div>
          ))}
          {elementDiff.totalChanged > elementDiff.changes.length ? (
            <div>{elementDiff.totalChanged - elementDiff.changes.length} more changed element{elementDiff.totalChanged - elementDiff.changes.length === 1 ? '' : 's'} summarized by the color overlays.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
