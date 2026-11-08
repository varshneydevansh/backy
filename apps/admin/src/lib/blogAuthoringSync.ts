/** Plate's node-id insertion transform writes `_id` onto its input nodes. */
export const cloneBlogRichTextValue = (value: any[]): any[] => JSON.parse(JSON.stringify(value));

/** Object key order can change across canonical save/read normalization. All stored fields remain meaningful. */
export function blogEditorSnapshotFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  });
}

/** Compare document meaning, while retaining authored identities in the stored payload. */
export function blogRichTextFingerprint(value: any[]): string {
  const comparable = (nodes: any[]): any[] => nodes.map((node) => {
    if (!node || typeof node !== 'object') return node;
    const { id: _identity, _id: _insertionIdentity, ...content } = node;
    return { ...content, ...(Array.isArray(node.children) ? { children: comparable(node.children) } : {}) };
  });
  return JSON.stringify(comparable(value));
}

export function preserveBlogRichTextIdentities(source: any[], edited: any[]): any[] {
  const identities = new Map<string, Record<string, unknown>>();
  const index = (nodes: any[]) => nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of ['id', '_id']) if (typeof node[key] === 'string') identities.set(node[key], node);
    if (Array.isArray(node.children)) index(node.children);
  });
  index(source);
  const restore = (nodes: any[], previous: any[]): any[] => nodes.map((node, position) => {
    if (!node || typeof node !== 'object') return node;
    const positional = previous.length === nodes.length && previous[position]?.type === node.type ? previous[position] : undefined;
    const original = identities.get(node.id) || identities.get(node._id) || positional;
    return {
      ...node,
      ...(original && Object.prototype.hasOwnProperty.call(original, 'id') ? { id: original.id } : {}),
      ...(original && Object.prototype.hasOwnProperty.call(original, '_id') ? { _id: original._id } : {}),
      ...(Array.isArray(node.children) ? { children: restore(node.children, original?.children || []) } : {}),
    };
  });
  return restore(cloneBlogRichTextValue(edited), source);
}
