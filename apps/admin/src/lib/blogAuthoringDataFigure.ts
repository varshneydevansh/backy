/** Public-only data adapter for article figures. It never uses an admin session. */
export type BlogDataFigureCollection = { id: string; name: string };
type PublicFetch = (input: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const publicCollection = (value: unknown, siteId: string): value is Record<string, unknown> => object(value)
  && typeof value.id === 'string' && !!value.id && value.siteId === siteId
  && value.status === 'published' && object(value.permissions) && value.permissions.publicRead === true;

async function readPublicData(url: string, signal: AbortSignal, request: PublicFetch): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const response = await request(url, { method: 'GET', credentials: 'omit', signal, headers: { accept: 'application/json' } });
  signal.throwIfAborted();
  if (!response.ok) throw new Error('Published collection data could not be loaded. Try again.');
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  if (!object(payload) || payload.success !== true || !object(payload.data)) throw new Error('Published collection data returned an invalid response.');
  return payload.data;
}

export async function loadBlogDataFigureCollections(apiBase: string, siteId: string, signal: AbortSignal, request: PublicFetch = fetch): Promise<BlogDataFigureCollection[]> {
  const data = await readPublicData(`${apiBase}/sites/${encodeURIComponent(siteId)}/collections`, signal, request);
  if (!Array.isArray(data.collections)) throw new Error('Published collection choices returned an invalid response.');
  return data.collections.filter((value) => publicCollection(value, siteId)).map((value) => ({ id: value.id as string, name: typeof value.name === 'string' && value.name.trim() ? value.name : value.id as string }));
}

