'use client';

import React, { useEffect, useState } from 'react';
import { isBackyDataFigureKey } from '@backy-cms/core';
import { InteractiveComponentElement, type InteractiveRenderableElement } from './InteractiveComponentContent';

type JsonRecord = Record<string, unknown>;
const object = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const FAILURE = 'This registered component is unavailable for this site or version.';

/** Saved URLs and capabilities never determine the article execution boundary. */
export function resolveRichInteractiveRegistryEntry(siteId: string, node: JsonRecord, payload: unknown): JsonRecord {
  if (!siteId || !string(node.componentKey) || !string(node.version) || (node.siteId !== undefined && node.siteId !== siteId)
    || !['interactiveFigure', 'codeComponent'].includes(string(node.elementType))) throw new Error(FAILURE);
  if (!object(payload) || payload.success !== true || !object(payload.data) || payload.data.siteId !== siteId || !Array.isArray(payload.data.components)) throw new Error(FAILURE);
  const entry = payload.data.components.find((entry) => object(entry) && entry.componentKey === node.componentKey && entry.version === node.version);
  if (!object(entry) || entry.status !== 'active' || entry.type !== node.elementType || (entry.siteId !== undefined && entry.siteId !== siteId)) throw new Error(FAILURE);
  if (entry.reviewStatus !== undefined && entry.reviewStatus !== 'approved') throw new Error(FAILURE);
  const trustedBuiltin = entry.source === 'built-in' && entry.type === 'interactiveFigure' && entry.renderMode === 'trusted-component';
  const sandbox = entry.type === 'codeComponent' && entry.renderMode === 'sandbox-iframe'
    && object(entry.integrity) && entry.integrity.signed === true && entry.integrity.signatureRequiredForCustomCode === true
    && object(payload.data.contract) && object(payload.data.contract.sandbox) && payload.data.contract.sandbox.enabled === true;
  if (!trustedBuiltin && !sandbox) throw new Error(FAILURE);
  return entry;
}

export async function loadRichInteractiveRegistryEntry(siteId: string, node: JsonRecord, signal: AbortSignal,
  request: typeof fetch = globalThis.fetch, apiBaseUrl = '/api'): Promise<JsonRecord> {
  signal.throwIfAborted();
  const response = await request(`${apiBaseUrl.replace(/\/+$/, '')}/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(string(node.componentKey))}/${encodeURIComponent(string(node.version))}`, { method: 'GET', cache: 'no-store', credentials: 'omit', signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(FAILURE);
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  return resolveRichInteractiveRegistryEntry(siteId, node, payload);
}

/** Runtime props are copied without rewriting the authored node or trusting its URLs. */
export function richInteractiveRuntimeElement(siteId: string, node: JsonRecord, entry?: JsonRecord, apiBaseUrl = '/api'): InteractiveRenderableElement {
  const props: JsonRecord = { ...(object(entry?.defaultProps) ? entry.defaultProps : {}), ...(object(node.props) ? node.props : {}) };
  for (const key of ['sandboxUrl', 'iframeUrl', 'url', 'src', 'runtimeUrl', 'sandbox', 'allow', 'renderCapabilities']) delete props[key];
  const componentKey = string(node.componentKey), version = string(node.version);
  const sandbox = entry?.renderMode === 'sandbox-iframe';
  if (sandbox) props.sandboxUrl = `${apiBaseUrl.replace(/\/+$/, '')}/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/sandbox`;
  // Unknown registered trusted figures retain the canvas renderer's sanitized fallback.
  const runnable = entry && (sandbox || componentKey === 'backy.figure.rounds' || isBackyDataFigureKey(componentKey));
  return {
    id: string(node.id) || `rich-component-${componentKey}-${version}`,
    type: runnable ? string(entry.type) : 'registeredFallback',
    componentKey, version, props,
    controls: Array.isArray(node.controls) ? node.controls.filter(object) : Array.isArray(entry?.controls) ? entry.controls.filter(object) : [],
    propsSchema: object(node.propsSchema) ? node.propsSchema : object(entry?.propsSchema) ? entry.propsSchema : undefined,
    fallback: typeof node.fallback === 'string' ? node.fallback : object(node.fallback) ? node.fallback : undefined,
    renderCapabilities: { hydrationMode: sandbox ? 'sandbox-iframe' : entry ? 'trusted-component' : 'static-fallback', sandbox: 'allow-scripts allow-forms', allowedPermissions: [] },
    dataBindings: Array.isArray(node.dataBindings) ? node.dataBindings.filter(object) : undefined,
    styles: { minHeight: sandbox ? 300 : undefined },
  };
}

/** Deterministic SSR fallback; current site registry authorizes client execution. */
export function RegisteredRichInteractiveComponent({ node, siteId, apiBaseUrl = '/api' }: { node: JsonRecord; siteId?: string; apiBaseUrl?: string }) {
  const [resolution, setResolution] = useState<{ identity: string; entry?: JsonRecord; error?: string }>();
  const identity = JSON.stringify([apiBaseUrl, siteId || '', node.componentKey, node.version, node.elementType, typeof node.siteId === 'string' ? node.siteId : node.siteId === undefined ? null : false]);
  useEffect(() => {
    const controller = new AbortController();
    if (!siteId) { setResolution({ identity, error: FAILURE }); return () => controller.abort(); }
    loadRichInteractiveRegistryEntry(siteId, node, controller.signal, globalThis.fetch, apiBaseUrl)
      .then((entry) => { if (!controller.signal.aborted) setResolution({ identity, entry }); })
      .catch(() => { if (!controller.signal.aborted) setResolution({ identity, error: FAILURE }); });
    return () => controller.abort();
  }, [apiBaseUrl, identity, node.siteId, siteId]);
  const current = resolution?.identity === identity ? resolution : undefined;
  return <div data-backy-rich-interactive-component={string(node.componentKey)} data-backy-rich-interactive-status={current?.entry ? 'ready' : current?.error ? 'error' : 'pending'}>
    <InteractiveComponentElement element={richInteractiveRuntimeElement(siteId || '', node, current?.entry, apiBaseUrl)} siteId={siteId} apiBaseUrl={apiBaseUrl} />
    {current?.error ? <p role="status">{current.error}</p> : null}
  </div>;
}
