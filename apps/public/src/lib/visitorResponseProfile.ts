const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const VISITOR_RESPONSE_PROFILE = 'visitor';
export const EDITABLE_MAP_SUMMARY_REF = '#/data/editableMapSummary';

/** Unknown, empty and repeated profiles never select a less strict response. */
export function responseProfile(params: URLSearchParams): 'full' | 'visitor' | 'invalid' {
  const values = params.getAll('profile');
  return values.length === 0 ? 'full'
    : values.length === 1 && values[0] === VISITOR_RESPONSE_PROFILE ? 'visitor' : 'invalid';
}

function projectSiteDesign(value: unknown, path: string, omitted: string[]): unknown {
  if (!record(value)) return value;
  const projected = { ...value };
  // Only site-wide authoring catalogs; chrome, tokens and unknown design fields stay intact.
  for (const field of ['templates', 'editableMap']) {
    if (Object.hasOwn(projected, field)) {
      delete projected[field];
      omitted.push(`${path}.${field}`);
    }
  }
  return projected;
}

const profileMetadata = (omittedFields: string[]) => ({
  schemaVersion: 'backy.response-profile.v1', name: VISITOR_RESPONSE_PROFILE, omittedFields,
});

/** Response-only visitor projection, AFTER runtime refs and BEFORE response hashing.
 * Distinct inline authored maps and every unknown content field stay unchanged.
 * The full map is available through the same endpoint with the profile omitted.
 */
export function projectVisitorRenderPayload(body: unknown): unknown {
  if (!record(body) || body.success !== true || !record(body.data)
    || !record(body.data.content) || !record(body.data.editableMap)) {
    throw new Error('Invalid visitor render projection source');
  }
  const data = { ...body.data }, map = body.data.editableMap;
  const counts: Record<string, number> = Object.create(null);
  for (const entry of Object.values(map)) {
    if (record(entry) && typeof entry.elementId === 'string' && entry.elementId) {
      counts[entry.elementId] = (counts[entry.elementId] || 0) + 1;
    }
  }
  const omitted = ['data.editableMap'];
  delete data.editableMap;
  data.editableMapSummary = {
    schemaVersion: 'backy.editable-map-summary.v1',
    entryCount: Object.keys(map).length,
    entryCountByElementId: counts,
  };
  const projectDocument = (document: Record<string, unknown>) => {
    if (document.editableMapRef !== '#/data/editableMap') return document;
    const projected: Record<string, unknown> = { ...document, editableMapSummaryRef: EDITABLE_MAP_SUMMARY_REF };
    delete projected.editableMapRef;
    return projected;
  };
  const content = projectDocument(body.data.content);
  data.content = record(content.contentDocument)
    ? { ...content, contentDocument: projectDocument(content.contentDocument) } : content;
  if (record(data.frontendDesign)) {
    data.frontendDesign = { ...data.frontendDesign,
      site: projectSiteDesign(data.frontendDesign.site, 'data.frontendDesign.site', omitted) };
  }
  data.responseProfile = profileMetadata(omitted);
  return { ...body, data };
}

/** Preserve discovery modules/contracts; only the exact unused site catalogs shrink. */
export function projectVisitorManifestPayload(body: unknown): unknown {
  if (!record(body) || body.success !== true || !record(body.data) || !record(body.data.site)) {
    throw new Error('Invalid visitor manifest projection source');
  }
  const omitted: string[] = [];
  return { ...body, data: { ...body.data,
    site: { ...body.data.site,
      frontendDesign: projectSiteDesign(body.data.site.frontendDesign, 'data.site.frontendDesign', omitted) },
    responseProfile: profileMetadata(omitted),
  } };
}
