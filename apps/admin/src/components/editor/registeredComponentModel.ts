import type { InteractiveComponentRegistryEntry } from '@/lib/adminContentApi';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Preserve authored extensions while registered identity and runtime admission stay authoritative. */
export const registeredComponentProps = (component: InteractiveComponentRegistryEntry, current: Record<string, unknown> = {}): Record<string, unknown> => {
  const metadata = record(component.dependencyMetadata);
  const defaults = clone(record(component.defaultProps || metadata.defaultProps));
  const sameIdentity = current.componentKey === component.componentKey && current.version === component.version;
  const fallback = { title: component.displayName || component.componentKey, text: component.description || '', ariaLabel: component.displayName || component.componentKey,
    ...clone(record(component.fallback || defaults.fallback)), ...(sameIdentity ? clone(record(current.fallback)) : {}) };
  return { ...clone(current), ...defaults, ...(sameIdentity ? clone(current) : {}),
    componentKey: component.componentKey, version: component.version,
    title: sameIdentity ? current.title ?? defaults.title ?? fallback.title : defaults.title ?? fallback.title,
    fallbackText: sameIdentity ? current.fallbackText ?? defaults.fallbackText ?? fallback.text : defaults.fallbackText ?? fallback.text,
    controls: clone(sameIdentity && Array.isArray(current.controls) ? current.controls : Array.isArray(component.controls) ? component.controls : Array.isArray(defaults.controls) ? defaults.controls : []),
    propsSchema: clone({ ...record(component.propsSchema || metadata.propsSchema || defaults.propsSchema), ...(sameIdentity ? record(current.propsSchema) : {}) }),
    ...(component.dataBindings !== undefined || metadata.dataBindings !== undefined || defaults.dataBindings !== undefined
      ? { dataBindings: clone(sameIdentity && current.dataBindings !== undefined ? current.dataBindings : component.dataBindings ?? metadata.dataBindings ?? defaults.dataBindings) } : {}),
    fallback,
    renderCapabilities: { ...clone(record(current.renderCapabilities)), ...clone(record(defaults.renderCapabilities)), ...clone(record(component.renderCapabilities || metadata.renderCapabilities)),
      hydrationMode: component.renderMode, requiresSandbox: component.renderMode === 'sandbox-iframe',
      requiresSignedBundle: component.integrity?.signatureRequiredForCustomCode === true, fallbackRequired: true, postMessageProtocol: 'backy.interactive-component.v1' },
    sandboxUrl: component.renderMode === 'sandbox-iframe' ? component.runtime?.sandboxUrl : undefined,
  };
};

/** Schema-only fields use the same typed controls as explicit registry control definitions. */
export const registeredComponentControls = (rawControls: unknown, rawSchema: unknown): Record<string, unknown>[] => {
  const controls = Array.isArray(rawControls) ? rawControls.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown>[] : [];
  const schema = record(rawSchema), properties = record(schema.properties);
  const keys = [...new Set([...controls.map((item) => String(item.key || '')), ...Object.keys(properties)])].filter((key) => key && !['__proto__', 'constructor', 'prototype'].includes(key));
  return keys.map((key) => {
    const property = record(properties[key]), control = controls.find((item) => item.key === key) || {};
    const type = Array.isArray(property.enum) ? 'select' : ['object', 'array'].includes(String(property.type)) ? 'json' : property.type === 'integer' ? 'number' : property.type;
    return { ...property, label: property.title || key, type, options: property.enum, min: property.minimum, max: property.maximum,
      step: property.type === 'integer' ? 1 : undefined, defaultValue: property.default, ...control, key };
  });
};
