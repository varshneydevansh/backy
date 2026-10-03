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
