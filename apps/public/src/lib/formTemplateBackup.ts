import type { SiteBackupRow } from '@backy-cms/core';
import { isValidFormTemplateInstancePin,templateInstanceFingerprint } from './templateInstanceProvenance';

/** A remapped valid baseline keeps its provenance; legacy/invalid pins do not gain it. */
export function remapRestoredFormTemplatePin(original: unknown,remapped: unknown,templateFingerprints:ReadonlyMap<string,string>=new Map()): unknown {
 if(!isValidFormTemplateInstancePin(original)||!remapped||typeof remapped!=='object'||Array.isArray(remapped))return null;
 const pin={...remapped,templateFingerprint:templateFingerprints.get(original.templateFingerprint)||original.templateFingerprint,baseContentFingerprint:templateInstanceFingerprint((remapped as any).baseContent)};
 return isValidFormTemplateInstancePin(pin)?pin:null;
}
export function remapRestoredFormTemplateRevisionFingerprint(original:SiteBackupRow,remapped:SiteBackupRow):string|null {
 if(!original.snapshot||typeof original.snapshot!=='object'||(original.snapshot as any).type!=='form'||original.fingerprint!==templateInstanceFingerprint(original.snapshot))return null;
 return templateInstanceFingerprint(remapped.snapshot);
}
