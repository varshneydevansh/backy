export type RichTextListType = 'ul' | 'ol';
export const RICH_TEXT_LIST_MAX_INDENT = 8;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object';
};

const isListType = (type: unknown): type is RichTextListType => {
  return type === 'ul' || type === 'ol';
};

const cloneNode = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value)) as T;
};

export const normalizeRichTextListIndent = (value: unknown): number | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const indent = typeof value.indent === 'number'
    ? value.indent
    : typeof value.indent === 'string'
      ? Number(value.indent)
      : NaN;
  if (!Number.isFinite(indent) || indent <= 0) {
    return undefined;
  }

  return Math.max(0, Math.min(RICH_TEXT_LIST_MAX_INDENT, Math.floor(indent)));
};

const cloneNodeWithNormalizedListIndent = (value: unknown): unknown => {
  const patchNode = (node: unknown): unknown => {
    if (!isRecord(node)) {
      return node;
    }

    const nextNode: Record<string, unknown> = { ...node };
    const children = Array.isArray(nextNode.children) ? nextNode.children : null;
    if (children) {
      nextNode.children = children.map((child) => patchNode(child));
    }

    if (nextNode.type === 'li') {
      const indent = normalizeRichTextListIndent(nextNode);
      if (typeof indent === 'number') {
        nextNode.indent = indent;
      } else {
        delete nextNode.indent;
      }
    }

    return nextNode;
  };

  return patchNode(cloneNode(value));
};

const emptyListItem = () => ({
  type: 'li',
  children: [{ text: '' }],
});

const getNodeText = (node: unknown): string => {
  if (!isRecord(node)) {
    return '';
  }

  if (typeof node.text === 'string') {
    return node.text;
  }

  const children = Array.isArray(node.children) ? node.children : [];
  return children.map((child) => getNodeText(child)).join('');
};

const getListItemOwnText = (node: unknown): string => {
  if (!isRecord(node)) {
    return '';
  }

  if (typeof node.text === 'string') {
    return node.text;
  }

  const children = Array.isArray(node.children) ? node.children : [];
  return children
    .filter((child) => !isRecord(child) || !isListType(child.type))
    .map((child) => getNodeText(child))
    .join('');
};

const listItemMatchesText = (node: unknown, needle: string): boolean => {
  if (!isRecord(node) || node.type !== 'li') {
    return false;
  }

  const ownText = getListItemOwnText(node).trim();
  return ownText === needle || ownText.includes(needle);
};

export const getRootListTypeFromNodes = (nodes: unknown[]): RichTextListType | null => {
  if (!nodes.length || !isRecord(nodes[0])) {
    return null;
  }

  const type = nodes[0].type;
  return isListType(type) ? type : null;
};

export const toListItemNodes = (nodes: unknown[]): unknown[] => {
  const listItems = nodes.flatMap((node): unknown[] => {
    if (!isRecord(node)) {
      return [{
        type: 'li',
        children: [{ text: String(node ?? '') }],
      }];
    }

    if (node.type === 'li') {
      return [cloneNodeWithNormalizedListIndent(node)];
    }

    const children = Array.isArray(node.children) ? node.children : null;

    if (isListType(node.type)) {
      if (!children?.length) {
        return [emptyListItem()];
      }

      const nestedItems = children.flatMap((child) => {
        if (isRecord(child) && child.type === 'li') {
          return [cloneNodeWithNormalizedListIndent(child)];
        }

        return toListItemNodes([child]);
      });

      return nestedItems.length ? nestedItems : [emptyListItem()];
    }

    if (!children) {
      return [{
        type: 'li',
        children: [{ text: String(node.text || '') }],
      }];
    }

    return [{
      type: 'li',
      children,
    }];
  });

  return listItems.length ? listItems : [emptyListItem()];
};

export const applyListTypeToNodes = (
  nodes: unknown[],
  format: RichTextListType
): { changed: boolean; nodes: unknown[] } => {
  const currentType = getRootListTypeFromNodes(nodes);
  if (currentType === format) {
    return { changed: false, nodes };
  }

  if (currentType) {
    return {
      changed: true,
      nodes: nodes.map((node) => {
        if (!isRecord(node) || !isListType(node.type)) {
          return node;
        }

        const nextNode = cloneNodeWithNormalizedListIndent(node) as Record<string, unknown>;
        return {
          ...nextNode,
          type: format,
        };
      }),
    };
  }

  return {
    changed: true,
    nodes: [{
      type: format,
      children: toListItemNodes(nodes),
    }],
  };
};

export const applyListTypeToSelectedListItemNodes = (
  nodes: unknown[],
  format: RichTextListType,
  selectedText: string
): { changed: boolean; nodes: unknown[] } => {
  const needle = selectedText.trim();
  if (!needle) {
    return { changed: false, nodes };
  }

  const patchNodes = (values: unknown[]): { changed: boolean; nodes: unknown[] } => {
    const nextNodes: unknown[] = [];
    let didChange = false;

    for (const node of values) {
      if (didChange || !isRecord(node)) {
        nextNodes.push(node);
        continue;
      }

      const children = Array.isArray(node.children) ? node.children : null;
      if (isListType(node.type) && children) {
        const selectedIndex = children.findIndex((child) => (
          listItemMatchesText(child, needle)
        ));

        if (selectedIndex >= 0) {
          const beforeItems = children.slice(0, selectedIndex).map((child) => cloneNodeWithNormalizedListIndent(child));
          const selectedItem = cloneNodeWithNormalizedListIndent(children[selectedIndex]);
          const afterItems = children.slice(selectedIndex + 1).map((child) => cloneNodeWithNormalizedListIndent(child));

          if (beforeItems.length > 0) {
            nextNodes.push({ ...(cloneNodeWithNormalizedListIndent(node) as Record<string, unknown>), children: beforeItems });
          }
          nextNodes.push({ ...(cloneNodeWithNormalizedListIndent(node) as Record<string, unknown>), type: format, children: [selectedItem] });
          if (afterItems.length > 0) {
            nextNodes.push({ ...(cloneNodeWithNormalizedListIndent(node) as Record<string, unknown>), children: afterItems });
          }
          didChange = true;
          continue;
        }
      }

      if (children) {
        const patchedChildren = patchNodes(children);
        if (patchedChildren.changed) {
          nextNodes.push({ ...cloneNode(node), children: patchedChildren.nodes });
          didChange = true;
          continue;
        }
      }

      nextNodes.push(node);
    }

    return { changed: didChange, nodes: nextNodes };
  };

  return patchNodes(nodes);
};

export const moveSelectedListItemNodes = (
  nodes: unknown[],
  selectedText: string,
  direction: -1 | 1
): { changed: boolean; nodes: unknown[] } => {
  const needle = selectedText.trim();
  if (!needle) {
    return { changed: false, nodes };
  }

  const patchNodes = (values: unknown[]): { changed: boolean; nodes: unknown[] } => {
    const listIndex = values.findIndex((node) => (
      isRecord(node) &&
      isListType(node.type) &&
      Array.isArray(node.children) &&
      node.children.some((child) => listItemMatchesText(child, needle))
    ));

    if (listIndex >= 0) {
      const listNode = values[listIndex] as Record<string, unknown>;
      const children = Array.isArray(listNode.children)
        ? listNode.children.map((child) => cloneNodeWithNormalizedListIndent(child))
        : [];
      const itemIndex = children.findIndex((child) => (
        listItemMatchesText(child, needle)
      ));
      const targetIndex = itemIndex + direction;

      if (targetIndex >= 0 && targetIndex < children.length) {
        const nextChildren = [...children];
        const selected = nextChildren[itemIndex];
        nextChildren[itemIndex] = nextChildren[targetIndex];
        nextChildren[targetIndex] = selected;
        const nextNodes = values.map((node, index) => index === listIndex
          ? { ...cloneNode(listNode), children: nextChildren }
          : node
        );
        return { changed: true, nodes: nextNodes };
      }

      const adjacentIndex = listIndex + direction;
      if (
        children.length === 1 &&
        adjacentIndex >= 0 &&
        adjacentIndex < values.length &&
        isRecord(values[adjacentIndex]) &&
        isListType((values[adjacentIndex] as Record<string, unknown>).type)
      ) {
        const nextNodes = values.map((node) => cloneNodeWithNormalizedListIndent(node));
        const selectedList = nextNodes[listIndex];
        nextNodes[listIndex] = nextNodes[adjacentIndex];
        nextNodes[adjacentIndex] = selectedList;
        return { changed: true, nodes: nextNodes };
      }
    }

    const nextNodes: unknown[] = [];
    let didChange = false;
    for (const node of values) {
      if (didChange || !isRecord(node) || !Array.isArray(node.children)) {
        nextNodes.push(node);
        continue;
      }

      const patchedChildren = patchNodes(node.children);
      if (patchedChildren.changed) {
        nextNodes.push({ ...cloneNode(node), children: patchedChildren.nodes });
        didChange = true;
      } else {
        nextNodes.push(node);
      }
    }

    return { changed: didChange, nodes: nextNodes };
  };

  return patchNodes(nodes);
};

export const applyListIndentToSelectedListItemNodes = (
  nodes: unknown[],
  selectedText: string,
  step: number
): { changed: boolean; nodes: unknown[] } => {
  const needle = selectedText.trim();
  if (!needle || step === 0) {
    return { changed: false, nodes };
  }

  const patchNodes = (values: unknown[]): { changed: boolean; nodes: unknown[] } => {
    const nextNodes: unknown[] = [];
    let didChange = false;

    for (const node of values) {
      if (didChange || !isRecord(node)) {
        nextNodes.push(node);
        continue;
      }

      const nextNode = cloneNode(node) as Record<string, unknown>;
      if (nextNode.type === 'li' && listItemMatchesText(nextNode, needle)) {
        const currentIndent = normalizeRichTextListIndent(nextNode) ?? 0;
        const nextIndent = Math.max(0, Math.min(RICH_TEXT_LIST_MAX_INDENT, currentIndent + step));
        if (nextIndent === 0) {
          delete nextNode.indent;
        } else {
          nextNode.indent = nextIndent;
        }
        nextNodes.push(nextNode);
        didChange = true;
        continue;
      }

      const children = Array.isArray(nextNode.children) ? nextNode.children : null;
      if (children) {
        const patchedChildren = patchNodes(children);
        if (patchedChildren.changed) {
          nextNode.children = patchedChildren.nodes;
          nextNodes.push(nextNode);
          didChange = true;
          continue;
        }
      }

      nextNodes.push(node);
    }

    return { changed: didChange, nodes: nextNodes };
  };

  return patchNodes(nodes);
};

export const applyListIndentToNodes = (nodes: unknown[], step: number): unknown[] => {
  const patchNode = (node: unknown): unknown => {
    if (!isRecord(node)) {
      return node;
    }

    const nextNode = { ...node };
    const children = Array.isArray(nextNode.children) ? nextNode.children : null;

    if (children) {
      nextNode.children = children.map((child) => patchNode(child));
    }

    if (nextNode.type === 'li') {
      const currentIndent = normalizeRichTextListIndent(nextNode) ?? 0;
      const nextIndent = Math.max(0, Math.min(RICH_TEXT_LIST_MAX_INDENT, currentIndent + step));
      if (nextIndent === 0) {
        delete nextNode.indent;
      } else {
        nextNode.indent = nextIndent;
      }
    }

    return nextNode;
  };

  return nodes.map((node) => patchNode(node));
};

export const normalizeNestedRichTextLists = (nodes: unknown[]): unknown[] => {
  const normalizeNode = (node: unknown): unknown => {
    if (!isRecord(node)) {
      return node;
    }

    const children = Array.isArray(node.children) ? node.children : null;
    if (!children) {
      return cloneNode(node);
    }

    if (isListType(node.type)) {
      return normalizeListContainer(node, 0);
    }

    return {
      ...cloneNode(node),
      children: children.map((child) => normalizeNode(child)),
    };
  };

  const normalizeListItem = (node: Record<string, unknown>, fallbackIndent: number): unknown[] => {
    const children = Array.isArray(node.children) ? node.children : [];
    const ownIndent = normalizeRichTextListIndent(node);
    const itemIndent = typeof ownIndent === 'number'
      ? ownIndent
      : Math.max(0, Math.min(RICH_TEXT_LIST_MAX_INDENT, fallbackIndent));
    const ownChildren = children
      .filter((child) => !isRecord(child) || !isListType(child.type))
      .map((child) => normalizeNode(child));
    const nestedLists = children.filter((child): child is Record<string, unknown> => (
      isRecord(child) && isListType(child.type)
    ));
    const normalizedItem: Record<string, unknown> = {
      ...cloneNode(node),
      children: ownChildren.length > 0 ? ownChildren : [{ text: '' }],
    };
    if (itemIndent > 0) {
      normalizedItem.indent = itemIndent;
    } else {
      delete normalizedItem.indent;
    }

    const nestedItems = nestedLists.flatMap((list) => normalizeListChildren(list, itemIndent + 1));
    return [normalizedItem, ...nestedItems];
  };

  const normalizeListChildren = (node: Record<string, unknown>, fallbackIndent: number): unknown[] => {
    const children = Array.isArray(node.children) ? node.children : [];
    const normalized = children.flatMap((child) => (
      isRecord(child) && child.type === 'li'
        ? normalizeListItem(child, Math.min(RICH_TEXT_LIST_MAX_INDENT, fallbackIndent))
        : []
    ));
    return normalized.length ? normalized : [emptyListItem()];
  };

  const normalizeListContainer = (node: Record<string, unknown>, fallbackIndent: number): unknown => ({
    ...cloneNode(node),
    children: normalizeListChildren(node, fallbackIndent),
  });

  return nodes.map((node) => normalizeNode(node));
};
