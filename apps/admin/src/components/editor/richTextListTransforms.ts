export type RichTextListType = 'ul' | 'ol';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object';
};

const isListType = (type: unknown): type is RichTextListType => {
  return type === 'ul' || type === 'ol';
};

const emptyListItem = () => ({
  type: 'li',
  children: [{ text: '' }],
});

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
      return [node];
    }

    const children = Array.isArray(node.children) ? node.children : null;

    if (isListType(node.type)) {
      if (!children?.length) {
        return [emptyListItem()];
      }

      const nestedItems = children.flatMap((child) => {
        if (isRecord(child) && child.type === 'li') {
          return [child];
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

        return {
          ...node,
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
      const currentIndent = Number(nextNode.indent || 0);
      if (Number.isFinite(currentIndent)) {
        const nextIndent = Math.max(0, currentIndent + step);
        if (nextIndent === 0) {
          delete nextNode.indent;
        } else {
          nextNode.indent = nextIndent;
        }
      }
    }

    return nextNode;
  };

  return nodes.map((node) => patchNode(node));
};
