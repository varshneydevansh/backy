const RICH_TEXT_LIST_MAX_INDENT = 8;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return !!value && typeof value === 'object';
};

const isListNodeType = (type: unknown): type is 'ul' | 'ol' => {
    return type === 'ul' || type === 'ol';
};

const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

export const normalizeNestedRichTextLists = (nodes: unknown[] = []): unknown[] => {
    const normalizeNode = (node: unknown): unknown => {
        if (!isRecord(node)) {
            return node;
        }

        const children = Array.isArray(node.children) ? node.children : null;
        if (!children) {
            return cloneValue(node);
        }

        if (isListNodeType(node.type)) {
            return normalizeListContainer(node, 0);
        }

        return {
            ...cloneValue(node),
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
            .filter((child) => !isRecord(child) || !isListNodeType(child.type))
            .map((child) => normalizeNode(child));
        const nestedLists = children.filter((child): child is Record<string, unknown> => (
            isRecord(child) && isListNodeType(child.type)
        ));
        const normalizedItem: Record<string, unknown> = {
            ...cloneValue(node),
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
        return normalized.length ? normalized : [{ type: 'li', children: [{ text: '' }] }];
    };

    const normalizeListContainer = (node: Record<string, unknown>, fallbackIndent: number): unknown => ({
        ...cloneValue(node),
        children: normalizeListChildren(node, fallbackIndent),
    });

    return Array.isArray(nodes) ? nodes.map((node) => normalizeNode(node)) : [];
};
