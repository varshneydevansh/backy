import type { CanvasElement } from '@/types/editor';

export type CanvasRevisionElementChangeKind = 'added' | 'removed' | 'updated';

export type CanvasRevisionPropertyChange = {
  property: string;
  snapshot: string;
  current: string;
};

export type CanvasRevisionElementChange = {
  id: string;
  kind: CanvasRevisionElementChangeKind;
  label: string;
  type: string;
  path: string;
  propertyChangeCount: number;
  properties: CanvasRevisionPropertyChange[];
};

export type CanvasRevisionElementDiff = {
  snapshotElementCount: number;
  currentElementCount: number;
  added: number;
  removed: number;
  updated: number;
  unchanged: number;
  totalChanged: number;
  addedIds: string[];
  removedIds: string[];
  updatedIds: string[];
  unchangedIds: string[];
  summary: string;
  changes: CanvasRevisionElementChange[];
};

type FlattenedCanvasElement = {
  id: string;
  label: string;
  type: string;
  path: string;
  element: CanvasElement;
};

const MAX_LISTED_ELEMENT_CHANGES = 8;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const sortSerializableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortSerializableValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((acc, key) => {
      const nextValue = value[key];
      if (typeof nextValue !== 'function' && typeof nextValue !== 'undefined') {
        acc[key] = sortSerializableValue(nextValue);
      }
      return acc;
    }, {});
};

const comparableValue = (value: unknown): string => {
  if (typeof value === 'undefined') return '';
  if (value === null) return 'null';

  try {
    return JSON.stringify(sortSerializableValue(value));
  } catch {
    return String(value);
  }
};

const displayValue = (value: unknown, fallback = 'empty'): string => {
  const raw = typeof value === 'string'
    ? value
    : typeof value === 'undefined' || value === null
      ? ''
      : comparableValue(value);
  const normalized = raw.trim();
  if (!normalized) return fallback;
  return normalized.length > 88 ? `${normalized.slice(0, 85)}...` : normalized;
};

const elementLabel = (element: CanvasElement): string => {
  const content = element.props?.content;
  const contentLabel = typeof content === 'string' ? content.trim() : '';
  return element.name?.trim() || contentLabel || `${element.type} ${element.id}`;
};

const flattenCanvasElements = (elements: CanvasElement[]): Map<string, FlattenedCanvasElement> => {
  const flattened = new Map<string, FlattenedCanvasElement>();

  const visit = (nodes: CanvasElement[], parentPath: string) => {
    nodes.forEach((element, index) => {
      const label = elementLabel(element);
      const path = parentPath ? `${parentPath} / ${index + 1}. ${label}` : `${index + 1}. ${label}`;
      flattened.set(element.id, {
        id: element.id,
        label,
        type: element.type,
        path,
        element,
      });

      if (element.children?.length) {
        visit(element.children, path);
      }
    });
  };

  visit(elements, '');
  return flattened;
};

const compareValue = (
  changes: CanvasRevisionPropertyChange[],
  property: string,
  snapshot: unknown,
  current: unknown,
) => {
  if (comparableValue(snapshot) === comparableValue(current)) {
    return;
  }

  changes.push({
    property,
    snapshot: displayValue(snapshot),
    current: displayValue(current),
  });
};

const compareRecordValues = (
  changes: CanvasRevisionPropertyChange[],
  prefix: string,
  snapshot: unknown,
  current: unknown,
) => {
  const snapshotRecord = isRecord(snapshot) ? snapshot : {};
  const currentRecord = isRecord(current) ? current : {};
  const keys = Array.from(new Set([...Object.keys(snapshotRecord), ...Object.keys(currentRecord)]))
    .sort((left, right) => left.localeCompare(right));

  keys.forEach((key) => {
    compareValue(changes, `${prefix}.${key}`, snapshotRecord[key], currentRecord[key]);
  });
};

const compareElementProperties = (
  snapshot: FlattenedCanvasElement,
  current: FlattenedCanvasElement,
): CanvasRevisionPropertyChange[] => {
  const changes: CanvasRevisionPropertyChange[] = [];
  const snapshotElement = snapshot.element;
  const currentElement = current.element;

  compareValue(changes, 'type', snapshotElement.type, currentElement.type);
  compareValue(changes, 'path', snapshot.path, current.path);
  compareValue(changes, 'x', snapshotElement.x, currentElement.x);
  compareValue(changes, 'y', snapshotElement.y, currentElement.y);
  compareValue(changes, 'width', snapshotElement.width, currentElement.width);
  compareValue(changes, 'height', snapshotElement.height, currentElement.height);
  compareValue(changes, 'rotation', snapshotElement.rotation || 0, currentElement.rotation || 0);
  compareValue(changes, 'zIndex', snapshotElement.zIndex, currentElement.zIndex);
  compareValue(changes, 'visible', snapshotElement.visible !== false, currentElement.visible !== false);
  compareValue(changes, 'locked', snapshotElement.locked === true, currentElement.locked === true);
  compareValue(changes, 'childCount', snapshotElement.children?.length || 0, currentElement.children?.length || 0);
  compareRecordValues(changes, 'props', snapshotElement.props, currentElement.props);
  compareRecordValues(changes, 'styles', snapshotElement.styles, currentElement.styles);
  compareRecordValues(changes, 'responsive', snapshotElement.responsive, currentElement.responsive);
  compareValue(changes, 'animation', snapshotElement.animation, currentElement.animation);
  compareValue(changes, 'dataBindings', snapshotElement.dataBindings, currentElement.dataBindings);
  compareValue(changes, 'bindingSlots', snapshotElement.bindingSlots, currentElement.bindingSlots);

  return changes;
};

const formatChangeCount = (count: number, label: string) => `${count} ${label}`;

const diffSummary = (diff: Pick<CanvasRevisionElementDiff, 'added' | 'removed' | 'updated' | 'unchanged' | 'totalChanged'>): string => {
  if (diff.totalChanged === 0) {
    return 'No element-level canvas changes.';
  }

  return [
    formatChangeCount(diff.added, 'added'),
    formatChangeCount(diff.removed, 'removed'),
    formatChangeCount(diff.updated, 'updated'),
    formatChangeCount(diff.unchanged, 'unchanged'),
  ].join(', ');
};

export const compareCanvasRevisionElements = (
  snapshotElements: CanvasElement[],
  currentElements: CanvasElement[],
): CanvasRevisionElementDiff => {
  const snapshotMap = flattenCanvasElements(snapshotElements);
  const currentMap = flattenCanvasElements(currentElements);
  const elementIds = Array.from(new Set([...snapshotMap.keys(), ...currentMap.keys()]))
    .sort((left, right) => left.localeCompare(right));
  let added = 0;
  let removed = 0;
  let updated = 0;
  let unchanged = 0;
  const addedIds: string[] = [];
  const removedIds: string[] = [];
  const updatedIds: string[] = [];
  const unchangedIds: string[] = [];
  const changes: CanvasRevisionElementChange[] = [];

  elementIds.forEach((id) => {
    const snapshot = snapshotMap.get(id);
    const current = currentMap.get(id);

    if (!snapshot && current) {
      added += 1;
      addedIds.push(id);
      if (changes.length < MAX_LISTED_ELEMENT_CHANGES) {
        changes.push({
          id,
          kind: 'added',
          label: current.label,
          type: current.type,
          path: current.path,
          propertyChangeCount: 1,
          properties: [{ property: 'element', snapshot: 'missing', current: `${current.type} at ${current.path}` }],
        });
      }
      return;
    }

    if (snapshot && !current) {
      removed += 1;
      removedIds.push(id);
      if (changes.length < MAX_LISTED_ELEMENT_CHANGES) {
        changes.push({
          id,
          kind: 'removed',
          label: snapshot.label,
          type: snapshot.type,
          path: snapshot.path,
          propertyChangeCount: 1,
          properties: [{ property: 'element', snapshot: `${snapshot.type} at ${snapshot.path}`, current: 'missing' }],
        });
      }
      return;
    }

    if (!snapshot || !current) {
      return;
    }

    const propertyChanges = compareElementProperties(snapshot, current);
    if (propertyChanges.length === 0) {
      unchanged += 1;
      unchangedIds.push(id);
      return;
    }

    updated += 1;
    updatedIds.push(id);
    if (changes.length < MAX_LISTED_ELEMENT_CHANGES) {
      changes.push({
        id,
        kind: 'updated',
        label: current.label,
        type: current.type,
        path: current.path,
        propertyChangeCount: propertyChanges.length,
        properties: propertyChanges,
      });
    }
  });

  const totalChanged = added + removed + updated;
  const diff = {
    snapshotElementCount: snapshotMap.size,
    currentElementCount: currentMap.size,
    added,
    removed,
    updated,
    unchanged,
    totalChanged,
    addedIds,
    removedIds,
    updatedIds,
    unchangedIds,
  };

  return {
    ...diff,
    summary: diffSummary(diff),
    changes,
  };
};
