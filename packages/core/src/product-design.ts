import { isBackyContentDocument } from './content-contract';

type DesignValues = Record<string, unknown>;
const record = (value: unknown): DesignValues => value && typeof value === 'object' && !Array.isArray(value) ? value as DesignValues : {};

/** Resolve the same saved product design in authoring and public rendering. */
export function productCanvasDesign(values: DesignValues): DesignValues {
  const envelope = record(values.design);
  const envelopeDocument = isBackyContentDocument(envelope.contentDocument) ? envelope.contentDocument : null;
  const design: DesignValues = { ...envelope };
  for (const [alias, value] of Object.entries({ ...envelope, ...values })) {
    if (!alias.startsWith('frontendDesign') || value === undefined) continue;
    const suffix = alias.slice('frontendDesign'.length);
    if (!suffix) continue;
    const key = suffix[0].toLowerCase() + suffix.slice(1);
    if (envelopeDocument && envelope[key] === undefined && envelope[alias] === undefined
      && (key === 'elements' || (key === 'canvasSize' && envelopeDocument.metadata?.canvasSize))) continue;
    if (design[key] === undefined) design[key] = envelope[alias] ?? value;
  }
  return design;
}


export interface BackyProductDesignSnapshot {
  schemaVersion: 'backy.product-design-version.v1';
  designPresent: boolean;
  design: unknown;
  mirrors: Record<string, unknown>;
  pin: unknown;
}
export interface BackyProductDesignRevision {
  id: string; siteId: string; collectionId: string; recordId: string;
  snapshot: BackyProductDesignSnapshot;
  operation: 'template-upgrade' | 'restore';
  templateId: string | null; targetRevisionId: string | null;
  actorId: string | null; requestId: string; createdAt: string;
}
export interface BackyProductDesignRevisionInput {
  operation: 'template-upgrade' | 'restore'; templateId?: string | null;
  targetRevisionId?: string | null; actorId?: string | null; requestId: string;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/** Effective editable design only: commerce/catalog values never enter the merge. */
export function canonicalProductTemplateDesign(values: DesignValues): DesignValues {
  const result = productCanvasDesign(values);
  for (const key of Object.keys(result)) if (key.startsWith('frontendDesign')) delete result[key];
  return clone(result);
}
/** Keep saved aliases aligned with the effective envelope, retaining unrelated values verbatim. */
export function withProductTemplateDesign(values: DesignValues, design: DesignValues, pin: unknown): DesignValues {
  const result: DesignValues = { ...values, design: clone(design), frontendTemplateInstance: clone(pin) };
  const aliases = new Set([...Object.keys(values), ...Object.keys(record(values.design))].filter(key => key.startsWith('frontendDesign')));
  for (const key of Object.keys(design)) if (key) aliases.add('frontendDesign' + key[0].toUpperCase() + key.slice(1));
  for (const alias of aliases) {
    const suffix = alias.slice('frontendDesign'.length), key = suffix[0]?.toLowerCase() + suffix.slice(1);
    if (!suffix) continue;
    if (design[key] !== undefined) result[alias] = clone(design[key]);
    else delete result[alias];
  }
  return result;
}
/** Validate JSON, prototype/credential safety and per-part history bounds before persistence. */
export function assertProductDesignHistorySafe(value: unknown, limit = 2 * 1024 * 1024): void {
  let count = 0;
  const visit = (item: unknown, depth: number) => {
    if (++count > 60000 || depth > 64) throw Error('PRODUCT_DESIGN_REVISION_LIMIT');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object') throw Error('PRODUCT_DESIGN_REVISION_INVALID');
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__','prototype','constructor'].includes(key) || /^(?:password|accessToken|refreshToken|sessionToken|apiKey|serviceRoleKey|privateKey|clientSecret|databaseUrl|smtpPassword|authorization|cookie|credentials)$/i.test(key)) throw Error('PRODUCT_DESIGN_REVISION_INVALID');
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > limit) throw Error('PRODUCT_DESIGN_REVISION_LIMIT');
}
export function snapshotProductTemplateDesign(values: DesignValues): BackyProductDesignSnapshot {
  const design = values.design === undefined ? null : values.design;
  const mirrors = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith('frontendDesign')));
  const candidate = record(values.frontendTemplateInstance);
  const pin = candidate.schemaVersion === 'backy.template-instance.v1' && candidate.instanceType === 'product' ? candidate : null;
  assertProductDesignHistorySafe(design); assertProductDesignHistorySafe(mirrors); assertProductDesignHistorySafe(pin);
  return clone({ schemaVersion: 'backy.product-design-version.v1', designPresent: values.design !== undefined, design, mirrors, pin });
}
export function restoreProductTemplateDesign(values: DesignValues, snapshot: BackyProductDesignSnapshot): DesignValues {
  if (snapshot.schemaVersion !== 'backy.product-design-version.v1' || typeof snapshot.designPresent !== 'boolean' || !snapshot.mirrors || typeof snapshot.mirrors !== 'object' || Array.isArray(snapshot.mirrors)
      || Object.keys(snapshot.mirrors).some(key => !key.startsWith('frontendDesign'))) throw Error('PRODUCT_DESIGN_REVISION_INVALID');
  assertProductDesignHistorySafe(snapshot.design); assertProductDesignHistorySafe(snapshot.mirrors); assertProductDesignHistorySafe(snapshot.pin);
  const result = { ...values };
  for (const key of Object.keys(result)) if (key.startsWith('frontendDesign')) delete result[key];
  Object.assign(result, clone(snapshot.mirrors));
  if (snapshot.designPresent) result.design = clone(snapshot.design); else delete result.design;
  if (snapshot.pin) result.frontendTemplateInstance = clone(snapshot.pin); else delete result.frontendTemplateInstance;
  return result;
}
