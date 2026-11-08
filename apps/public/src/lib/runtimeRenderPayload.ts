export const RUNTIME_RENDER_SCHEMA = 'backy.content-payload.runtime.v1';
export const RUNTIME_CONTENT_SCHEMA = 'backy.content.runtime.v1';
export const RUNTIME_EDITABLE_MAP_REF = '#/data/editableMap';

const record = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

// Compare JSON values, independent of property order or runtime object realm.
// No coercion, pointer traversal or unknown nested authored-field rewriting.
const sameJson = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]));
  }
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
};

/** Response-only projection. Only the two known duplicate paths may use a ref.
 * Distinct maps and unknown authored objects remain inline, without mutation.
 * This runtime document is deliberately NOT a canonical saved content document.
 */
export function projectRuntimeRenderPayload(body: unknown): unknown {
  if (!record(body) || body.success !== true || !record(body.data)
    || !record(body.data.editableMap) || !record(body.data.content)) {
    throw new Error('Invalid runtime render payload');
  }
  const data = body.data;
  const sourceContent = body.data.content;
  const projectDocument = (document: Record<string, unknown>) => {
    if (document.schemaVersion !== 'backy.content.v1'
      || Object.hasOwn(document, 'editableMapRef')) {
      throw new Error('Invalid canonical runtime projection source');
    }
    const projected: Record<string, unknown> = { ...document, schemaVersion: RUNTIME_CONTENT_SCHEMA };
    if (record(document.editableMap) && sameJson(document.editableMap, data.editableMap)) {
      delete projected.editableMap;
      projected.editableMapRef = RUNTIME_EDITABLE_MAP_REF;
    }
    return projected;
  };
  const content = projectDocument(sourceContent);
  if (record(sourceContent.contentDocument)) {
    content.contentDocument = projectDocument(sourceContent.contentDocument);
  }
  return { ...body, data: { ...data, content } };
}
