import { loadInteractiveRegistryPages } from './interactiveRegistryLoading';
import type { BackyInteractiveComponentNode, BackyInteractiveRegistryEntry } from '@backy-cms/editor';
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export type BlogInteractiveFetch = (url: string, init: RequestInit) => Promise<Response>;

export async function loadBlogInteractiveComponents(apiBaseUrl: string, siteId: string, signal: AbortSignal, request: BlogInteractiveFetch = fetch): Promise<BackyInteractiveRegistryEntry[]> {
  const data = await loadInteractiveRegistryPages(`${apiBaseUrl.replace(/\/$/, '')}/sites/${encodeURIComponent(siteId)}/interactive-components`, siteId, signal, request);
  return authoringInteractiveEntries(data);
}
export function authoringInteractiveEntries(data: { contract?: unknown; components: Record<string, unknown>[] }): BackyInteractiveRegistryEntry[] {
  const sandboxDisabled = record(data.contract) && record(data.contract.sandbox) && data.contract.sandbox.enabled === false;
  const entries = data.components.filter((entry): entry is BackyInteractiveRegistryEntry => record(entry) && entry.status === 'active' && typeof entry.componentKey === 'string' && !!entry.componentKey.trim() && typeof entry.version === 'string' && !!entry.version.trim() && ['interactiveFigure', 'codeComponent'].includes(String(entry.type)) && ['trusted-component', 'sandbox-iframe', 'static-fallback'].includes(String(entry.renderMode)));
  return entries.map((entry) => sandboxDisabled && entry.type === 'codeComponent' && entry.renderMode === 'sandbox-iframe' ? { ...entry, runtimeAvailable: false, runtimeUnavailableReason: 'Custom code execution is disabled for this site. This component uses its saved fallback.' } : entry);
}

export function registeredBlogComponent(node: BackyInteractiveComponentNode, entries: BackyInteractiveRegistryEntry[]) {
  return entries.find((entry) => entry.status === 'active' && entry.componentKey === node.componentKey && entry.version === node.version && entry.type === node.elementType);
}
/** The registered identity chooses the route. Saved URLs and sandbox permissions never do. */
export function blogInteractiveSandboxUrl(apiBaseUrl: string, siteId: string, entry: BackyInteractiveRegistryEntry, browserOrigin: string): string {
  let base: URL;
  try { base = new URL(apiBaseUrl, browserOrigin); } catch { return ''; }
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || !/\/api\/?$/.test(base.pathname) || !siteId || !entry.componentKey || !entry.version || entry.status !== 'active' || entry.type !== 'codeComponent' || entry.renderMode !== 'sandbox-iframe' || entry.runtimeAvailable === false) return '';
  return `${base.origin}${base.pathname.replace(/\/$/, '')}/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(entry.componentKey)}/${encodeURIComponent(entry.version)}/sandbox`;
}
export function blogInteractiveInitPayload(node: BackyInteractiveComponentNode) {
  return { type: 'backy.interactive-component.init', protocol: 'backy.interactive-component.v1', componentKey: node.componentKey, version: node.version,
    props: node.props || {}, controls: node.controls || [], fallback: node.fallback || {}, dataBindings: node.dataBindings ?? {} };
}

export const blogInteractiveMeasurementKey = (node: BackyInteractiveComponentNode) => JSON.stringify([node._id || node.id || '', node.componentKey, node.version, node.props, node.controls, node.dataBindings]);
