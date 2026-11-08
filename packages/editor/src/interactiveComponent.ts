import type { ReactNode } from 'react';

export type InteractiveRecord = Record<string, unknown>;
export interface BackyInteractiveComponentNode extends InteractiveRecord {
  type: 'interactive_component';
  componentKey: string;
  version: string;
  elementType: 'interactiveFigure' | 'codeComponent';
  props: InteractiveRecord;
  controls: InteractiveRecord[];
  propsSchema?: InteractiveRecord;
  fallback: InteractiveRecord;
  renderCapabilities: InteractiveRecord;
  dataBindings?: unknown;
  children: Array<{ text: string; [key: string]: unknown }>;
}
export interface BackyInteractiveRegistryEntry extends InteractiveRecord {
  componentKey: string;
  version: string;
  type: 'interactiveFigure' | 'codeComponent';
  status: string;
  displayName?: string;
  description?: string;
  renderMode: 'trusted-component' | 'sandbox-iframe' | 'static-fallback';
  defaultProps?: InteractiveRecord;
  propsSchema?: InteractiveRecord;
  controls?: InteractiveRecord[];
  runtime?: InteractiveRecord;
}
export type BackyInteractiveComponentRenderer = (node: BackyInteractiveComponentNode, context: { readOnly: boolean }) => ReactNode;
export const interactiveRecord = (value: unknown): InteractiveRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as InteractiveRecord : {};
export const cloneInteractiveValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export const usableInteractiveRegistryEntries = (entries: BackyInteractiveRegistryEntry[]) => entries.filter((entry) => entry && entry.status === 'active' && typeof entry.componentKey === 'string' && entry.componentKey.trim() && typeof entry.version === 'string' && entry.version.trim() && ['interactiveFigure', 'codeComponent'].includes(entry.type) && ['trusted-component', 'sandbox-iframe', 'static-fallback'].includes(entry.renderMode));

export function createRichInteractiveComponent(entry: BackyInteractiveRegistryEntry): BackyInteractiveComponentNode {
  if (!usableInteractiveRegistryEntries([entry]).length) throw new Error('Choose an active registered component.');
  const props = cloneInteractiveValue(interactiveRecord(entry.defaultProps));
  const controls = cloneInteractiveValue(Array.isArray(entry.controls) ? entry.controls.filter((control) => control && typeof control === 'object' && !Array.isArray(control)) : []);
  const fallback = { ...cloneInteractiveValue(interactiveRecord(entry.fallback)), title: entry.displayName || entry.componentKey, text: entry.description || '', ariaLabel: entry.displayName || entry.componentKey };
  return { type: 'interactive_component', componentKey: entry.componentKey, version: entry.version, elementType: entry.type,
    props, controls, ...(entry.propsSchema ? { propsSchema: cloneInteractiveValue(entry.propsSchema) } : {}), fallback,
    renderCapabilities: { hydrationMode: entry.renderMode, requiresSandbox: entry.renderMode === 'sandbox-iframe', fallbackRequired: true, postMessageProtocol: 'backy.interactive-component.v1', ...cloneInteractiveValue(interactiveRecord(entry.renderCapabilities)) },
    ...(entry.dataBindings !== undefined ? { dataBindings: cloneInteractiveValue(entry.dataBindings) } : {}), children: [{ text: '' }] };
}
export function patchInteractiveComponentValue(node: BackyInteractiveComponentNode, key: string, value: unknown) {
  if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('This property cannot be edited.');
  return { props: { ...interactiveRecord(node.props), [key]: value }, controls: (Array.isArray(node.controls) ? node.controls : []).map((control) => control && control.key === key ? { ...control, value } : control) };
}
export function interactiveComponentFields(node: BackyInteractiveComponentNode): InteractiveRecord[] {
  const properties = interactiveRecord(interactiveRecord(node.propsSchema).properties);
  const required = Array.isArray(node.propsSchema?.required) ? node.propsSchema.required : [];
  const controls = Array.isArray(node.controls) ? node.controls.filter((control) => control && typeof control === 'object' && !Array.isArray(control)) : [];
  const keys = [...new Set([...controls.map((control) => control.key), ...Object.keys(properties)])].filter((key): key is string => typeof key === 'string' && Boolean(key) && !['__proto__', 'constructor', 'prototype'].includes(key));
  return keys.map((key) => ({ ...interactiveRecord(properties[key]), ...controls.find((control) => control.key === key), key, required: required.includes(key) || controls.find((control) => control.key === key)?.required === true }));
}
export function interactiveComponentValue(node: BackyInteractiveComponentNode, field: InteractiveRecord): unknown {
  const props = interactiveRecord(node.props);
  const key = String(field.key);
  return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : field.value ?? field.defaultValue ?? field.default ?? '';
}
