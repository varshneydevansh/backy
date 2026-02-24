type SlateNode = {
  type?: string;
  text?: string;
  children?: unknown[];
};

export type ListType = 'bullet' | 'number';

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

  return '';
};

export const buildListContentFromItems = (items: unknown = [], listType: ListType = 'bullet'): unknown[] => {
  const normalized = Array.isArray(items)
    ? items.map((item) => toListItemText(item))
    : [];

  const hasExplicitItems = Array.isArray(items) && items.length > 0;
  const hasMeaningfulItem = normalized.some((item) => item.length > 0);
  const safeItems = hasExplicitItems
    ? normalized
    : hasMeaningfulItem
      ? normalized
      : [listPlaceholderItem];

  return [
    {
      type: normalizeListType(listType) === 'number' ? 'ol' : 'ul',
      children: safeItems.map((item) => ({
        type: 'li',
        children: [{ text: item }],
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

export const extractListItemsFromSlate = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: string[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const typed = node as SlateNode;

    if (typed.type === 'ul' || typed.type === 'ol') {
      const children = Array.isArray(typed.children) ? typed.children : [];
      const hasListItems = children.some((child) => {
        if (!child || typeof child !== 'object') return false;
        return (child as SlateNode).type === 'li';
      });

        if (hasListItems) {
          children.forEach((child) => {
            if (child && typeof child === 'object' && (child as SlateNode).type === 'li') {
              const text = getNodeText(child);
              items.push(text.trimEnd());
              return;
            }
          });
        return;
      }
    }

    if (typed.type === 'li') {
      const text = getNodeText(typed);
      items.push(text.trimEnd());
      return;
    }

    if (Array.isArray(typed.children)) {
      typed.children.forEach((child) => walk(child));
    }
  };

  value.forEach((node) => walk(node));
  return items;
};

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
  const contentItems = extractListItemsFromSlate(props?.content);
  if (contentItems.length > 0) {
    return contentItems.map((item) => item.trimEnd());
  }

  if (Array.isArray(props?.items)) {
    return props.items
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trimEnd());
  }

  return [listPlaceholderItem];
};
