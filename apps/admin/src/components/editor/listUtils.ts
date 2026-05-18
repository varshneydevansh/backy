type SlateNode = {
  type?: string;
  text?: string;
  indent?: unknown;
  children?: unknown[];
};

export type ListType = 'bullet' | 'number';
export type ListItemEntry = {
  text: string;
  indent?: number;
};

const LIST_MAX_INDENT = 8;

const normalizeListType = (listType: unknown): ListType =>
  listType === 'number' || listType === 'ordered' || listType === 'decimal' ? 'number' : 'bullet';

export const listPlaceholderItem = 'List item';

const toListItemText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trimEnd();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.label === 'string') {
      return record.label.trimEnd();
    }
    if (typeof record.value === 'string') {
      return record.value.trimEnd();
    }
    if (typeof record.text === 'string') {
      return record.text.trimEnd();
    }
  }

  return '';
};

const toListItemIndent = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = (value as Record<string, unknown>).indent;
  const indent = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(indent) || indent <= 0) {
    return undefined;
  }

  return Math.max(0, Math.min(LIST_MAX_INDENT, Math.floor(indent)));
};

export const buildListContentFromItems = (items: unknown = [], listType: ListType = 'bullet'): unknown[] => {
  const normalized: ListItemEntry[] = Array.isArray(items)
    ? items.map((item) => ({
      text: toListItemText(item),
      indent: toListItemIndent(item),
    }))
    : [];

  const hasExplicitItems = Array.isArray(items) && items.length > 0;
  const hasMeaningfulItem = normalized.some((item) => item.text.length > 0);
  const safeItems = hasExplicitItems
    ? normalized
    : hasMeaningfulItem
      ? normalized
      : [{ text: listPlaceholderItem }];

  return [
    {
      type: normalizeListType(listType) === 'number' ? 'ol' : 'ul',
      children: safeItems.map((item) => ({
        type: 'li',
        ...(item.indent ? { indent: item.indent } : {}),
        children: [{ text: item.text }],
      })),
    },
  ];
};

const getNodeText = (node: unknown): string => {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typed = node as SlateNode;
  if (typeof typed.text === 'string') {
    return typed.text;
  }

  if (!Array.isArray(typed.children)) {
    return '';
  }

  return typed.children.map(getNodeText).join('');
};

const getListItemOwnText = (node: unknown): string => {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typed = node as SlateNode;
  if (!Array.isArray(typed.children)) {
    return typeof typed.text === 'string' ? typed.text : '';
  }

  return typed.children
    .filter((child) => {
      if (!child || typeof child !== 'object') {
        return true;
      }
      const childType = (child as SlateNode).type;
      return childType !== 'ul' && childType !== 'ol';
    })
    .map(getNodeText)
    .join('');
};

export const extractListItemEntriesFromSlate = (value: unknown): ListItemEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: ListItemEntry[] = [];

  const walk = (node: unknown, inheritedIndent = 0) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const typed = node as SlateNode;
    const ownIndent = toListItemIndent(typed);

    if (typed.type === 'ul' || typed.type === 'ol') {
      const children = Array.isArray(typed.children) ? typed.children : [];
      const hasListItems = children.some((child) => {
        if (!child || typeof child !== 'object') return false;
        return (child as SlateNode).type === 'li';
      });

      if (hasListItems) {
        children.forEach((child) => {
          if (child && typeof child === 'object' && (child as SlateNode).type === 'li') {
            walk(child, inheritedIndent);
          }
        });
        return;
      }
    }

    if (typed.type === 'li') {
      const indent = ownIndent ?? inheritedIndent;
      items.push({
        text: getListItemOwnText(typed).trimEnd(),
        ...(indent > 0 ? { indent } : {}),
      });
      if (Array.isArray(typed.children)) {
        typed.children.forEach((child) => {
          if (child && typeof child === 'object') {
            const childType = (child as SlateNode).type;
            if (childType === 'ul' || childType === 'ol') {
              walk(child, indent + 1);
            }
          }
        });
      }
      return;
    }

    if (Array.isArray(typed.children)) {
      typed.children.forEach((child) => walk(child, inheritedIndent));
    }
  };

  value.forEach((node) => walk(node));
  return items;
};

export const extractListItemsFromSlate = (value: unknown): string[] => (
  extractListItemEntriesFromSlate(value).map((item) => item.text)
);

export const getListTypeFromSlate = (value: unknown): ListType => {
  if (!Array.isArray(value)) {
    return 'bullet';
  }

  let found: ListType = 'bullet';

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const typed = node as SlateNode;
    if (typed.type === 'ol') {
      found = 'number';
      return;
    }
    if (typed.type === 'ul') {
      found = 'bullet';
      return;
    }

    if (Array.isArray(typed.children)) {
      typed.children.forEach((child) => walk(child));
    }
  };

  value.forEach((node) => walk(node));
  return found;
};

export const normalizeListContent = (props: {
  content?: unknown;
  items?: unknown;
  listType?: unknown;
}): unknown[] => {
  if (Array.isArray(props?.content) && props.content.length > 0) {
    return props.content;
  }

  if (typeof props?.content === 'string' && props.content.trim().length > 0) {
    return buildListContentFromItems([props.content], normalizeListType(props.listType));
  }

  if (Array.isArray(props?.items) && props.items.length > 0) {
    return buildListContentFromItems(props.items, normalizeListType(props.listType));
  }

  return buildListContentFromItems([listPlaceholderItem], normalizeListType(props?.listType));
};

export const getListItemsFromProps = (props: {
  content?: unknown;
  items?: unknown;
}): string[] => {
  const contentItems = extractListItemEntriesFromSlate(props?.content);
  if (contentItems.length > 0) {
    return contentItems.map((item) => item.text.trimEnd());
  }

  if (Array.isArray(props?.items)) {
    return props.items
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trimEnd());
  }

  return [listPlaceholderItem];
};
