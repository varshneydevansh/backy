const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const privateKey = (key: string) => {
  const name = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  // Scientific token/session fields are public data; credential names are reserved.
  return /secret|password|apikey|privatekey|credential|authorization|cookie|servicerole|databaseurl|connectionstring|smtp/.test(name)
    || /^(?:(?:access|refresh|id|api|auth|bearer|csrf|xsrf|oauth|github|gitlab|provider|personalaccess|jwt)?token|session(?:id|key|token)?)$/.test(name)
    || /^(?:auth|admin|provider)(?:$|settings|config|api|envelope|data)/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(key);
};
const privateValue = (value: string) => /^(?:Bearer\s+|(?:sk|rk)_(?:live|test)_|sk-(?:proj-|[a-zA-Z0-9]{16})|postgres(?:ql)?:\/\/|eyJ[a-zA-Z0-9_-]+\.)/i.test(value.trimStart());

/** Public metadata and runtime copies exclude secrets; author storage is never rewritten. */
export function sanitizePublicInteractiveComponentMetadata(value: unknown): Record<string, unknown> | undefined {
  const ancestors = new WeakSet<object>();
  let budget = 2000;
  let exceeded = false;
  const visit = (value: unknown, depth: number, key = ''): unknown => {
    if (depth > 20 || --budget < 0) { exceeded = true; return undefined; }
    if (typeof value === 'string') return privateValue(value) || (['required', 'propertyNames'].includes(key) && privateKey(value)) ? undefined : value;
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || ancestors.has(value)) return undefined;
    ancestors.add(value);
    const result = Array.isArray(value) ? value.map((child) => visit(child, depth + 1, key)).filter((child) => child !== undefined)
      : Object.fromEntries(Object.entries(value).filter(([name]) => !privateKey(name)).map(([name, child]) => [name, visit(child, depth + 1, name)]).filter(([, child]) => child !== undefined));
    ancestors.delete(value);
    return result;
  };
  const result = visit(value, 0);
  return !exceeded && object(result) ? result : undefined;
}
