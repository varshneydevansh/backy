/** Frontend declarations and location-specific diagnostics. Declarations are not live certification. */
import { resolveBackyChildLayout, isBackyFlowChild, type BackyChildLayout } from './canvas-layout';
export type FrontendCapabilityStatus = 'supported' | 'fallback' | 'unsupported';
export interface FrontendRuntimeDeclaration {
  schemaVersion: 'backy.frontend-runtime.v1';
  frontendId: string;
  version: string;
  capabilities: Record<string, FrontendCapabilityStatus>;
  componentVersions?: Record<string, string[]>;
}
const frontendDomLimitations = new Set(['expected-inventory.unknown', 'identity.missing', 'revision.missing', 'iframe.unobserved', 'inventory.limit', 'dom-walk.limit', 'shadow-dom.unobserved', 'element-id.invalid', 'element-id.duplicate', 'element-type.unknown', 'parent.ambiguous', 'visibility.hidden', 'geometry.unmapped', 'geometry.invalid', 'inventory.byte-limit', 'expected-element.absent', 'element.unregistered', 'mapping.unknown']);
export interface FrontendDomCaptureEvidence {
  schemaVersion: 'backy.frontend-dom-evidence.v1';
  source: 'browser-dom';
  capturedAt: string;
  viewport: { width: number; height: number };
  expectedCount: number;
  capturedCount: number;
  limitations: string[];
}
export interface FrontendElementDomEvidence {
  rect: { x: number; y: number; width: number; height: number };
  visibility: 'rendered' | 'hidden';
  positioning: 'absolute' | 'fixed' | 'relative' | 'static' | 'sticky' | 'unknown';
  transformed: boolean;
}
export interface FrontendObservation {
  siteId: string;
  route: string;
  frontendId: string;
  frontendVersion: string;
  revision?: string;
  breakpoint: string;
  complete: boolean;
  domCapture?: FrontendDomCaptureEvidence;
  elements: Array<{ id: string; type?: string; parentId?: string | null; fields?: Record<string, unknown>; dom?: FrontendElementDomEvidence }>;
}
export interface FrontendCompatibilityIssue {
  code: string;
  status: 'unsupported' | 'fallback' | 'missing' | 'mismatch' | 'unverified';
  route: string;
  elementId?: string;
  contentPath: string;
  breakpoint?: string;
  capability?: string;
  expected?: unknown;
  observed?: unknown;
  repairOwner: 'custom-frontend' | 'registration' | 'verification';
  suggestedAction: string;
  evidence: 'declaration' | 'supplied-observation' | 'none';
}
export interface FrontendCompatibilityReport {
  schemaVersion: 'backy.frontend-compatibility-report.v1';
  siteId: string;
  route: string;
  revision?: string;
  frontend: FrontendRuntimeDeclaration | null;
  certification: 'not-live-certified';
  summary: { elementCount: number; requirementCount: number; issueCount: number; blocking: number; unverified: number; fallbacks: number };
  issues: FrontendCompatibilityIssue[];
  nextAction: string;
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.:/@+-]{0,199}$/;
const forbidden = /(?:password|secret|authorization|cookie|credential|api.?key|access.?token|refresh.?token)/i;
const safeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 12) return '[depth limit]';
  if (Array.isArray(value)) return value.map(item => safeValue(item, depth + 1));
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, forbidden.test(key) ? '[redacted]' : safeValue(item, depth + 1)]));
  return typeof value === 'string' && value.length > 2000 ? value.slice(0, 2000) + '…' : value;
};
export function normalizeFrontendRuntimeDeclaration(value: unknown): FrontendRuntimeDeclaration | undefined {
  if (value == null) return undefined;
  if (!record(value) || value.schemaVersion !== 'backy.frontend-runtime.v1' || !identifier.test(text(value.frontendId)) || !identifier.test(text(value.version)) || !record(value.capabilities)) {
    throw new Error('Runtime declaration requires schemaVersion, frontendId, version and a capabilities map.');
  }
  const entries = Object.entries(value.capabilities);
  if (entries.length > 500) throw new Error('Runtime declaration exceeds 500 capabilities.');
  const capabilities: Record<string, FrontendCapabilityStatus> = {};
  for (const [key, status] of entries) {
    if (!identifier.test(key) || (typeof status !== 'string' || !['supported', 'fallback', 'unsupported'].includes(status))) throw new Error('Invalid runtime capability name or status.');
    Object.defineProperty(capabilities, key, { value: status, enumerable: true });
  }
  const componentVersions: Record<string, string[]> = {};
  if (value.componentVersions !== undefined) {
    if (!record(value.componentVersions) || Object.keys(value.componentVersions).length > 1000) throw new Error('Invalid component version declaration.');
    for (const [key, versions] of Object.entries(value.componentVersions)) {
      if (!identifier.test(key) || !Array.isArray(versions) || versions.length > 1000 || versions.some(version => !identifier.test(text(version)))) throw new Error('Invalid component key/version declaration.');
      Object.defineProperty(componentVersions, key, { value: [...new Set(versions.map(text))], enumerable: true });
    }
  }
  return { schemaVersion: 'backy.frontend-runtime.v1', frontendId: text(value.frontendId), version: text(value.version), capabilities, componentVersions };
}
export function normalizeFrontendObservation(value: unknown): FrontendObservation | undefined {
  if (value == null) return undefined;
  if (!record(value) || !Array.isArray(value.elements) || value.elements.length > 10000 || !['desktop', 'tablet', 'mobile'].includes(text(value.breakpoint)) || !text(value.siteId) || !text(value.route) || !text(value.frontendId) || !text(value.frontendVersion)) throw new Error('Observations require a breakpoint and bounded element inventory.');
  let domCapture: FrontendDomCaptureEvidence | undefined;
  if (value.domCapture !== undefined) {
    const capture = value.domCapture;
    if (!record(capture) || capture.schemaVersion !== 'backy.frontend-dom-evidence.v1' || capture.source !== 'browser-dom'
      || !record(capture.viewport) || ![capture.viewport.width, capture.viewport.height].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100000)
      || ![capture.expectedCount, capture.capturedCount].every(n => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10000)
      || typeof capture.capturedAt !== 'string' || !Number.isFinite(Date.parse(capture.capturedAt))
      || !Array.isArray(capture.limitations) || capture.limitations.length > 32
      || capture.limitations.some(reason => typeof reason !== 'string' || !frontendDomLimitations.has(reason))) throw new Error('Invalid bounded DOM capture evidence.');
    domCapture = { schemaVersion: 'backy.frontend-dom-evidence.v1', source: 'browser-dom', capturedAt: new Date(capture.capturedAt).toISOString(),
      viewport: { width: capture.viewport.width as number, height: capture.viewport.height as number }, expectedCount: capture.expectedCount as number,
      capturedCount: capture.capturedCount as number, limitations: [...new Set(capture.limitations)] as string[] };
    if (domCapture.capturedCount !== value.elements.length) throw new Error('DOM capture count does not match the observed inventory.');
  }
  const ids = new Set<string>();
  const elements = value.elements.map(item => {
    if (!record(item) || !text(item.id) || ids.has(text(item.id))) throw new Error('Observation element IDs must be present and unique.');
    ids.add(text(item.id));
    if (item.fields !== undefined && (!record(item.fields) || Object.keys(item.fields).length > 200)) throw new Error('Invalid observation fields.');
    let dom: FrontendElementDomEvidence | undefined;
    if (item.dom !== undefined) {
      const rectangle = record(item.dom) && record(item.dom.rect) ? item.dom.rect : {};
      if (!record(item.dom) || !record(item.dom.rect) || !['x', 'y', 'width', 'height'].every(key => typeof rectangle[key] === 'number' && Number.isFinite(rectangle[key]) && Math.abs(rectangle[key] as number) <= 10000000)
        || (typeof rectangle.width === 'number' && rectangle.width < 0) || (typeof rectangle.height === 'number' && rectangle.height < 0)
        || !['rendered', 'hidden'].includes(text(item.dom.visibility)) || !['absolute', 'fixed', 'relative', 'static', 'sticky', 'unknown'].includes(text(item.dom.positioning)) || typeof item.dom.transformed !== 'boolean') throw new Error('Invalid DOM element geometry evidence.');
      dom = { rect: { x: item.dom.rect.x as number, y: item.dom.rect.y as number, width: item.dom.rect.width as number, height: item.dom.rect.height as number }, visibility: item.dom.visibility as FrontendElementDomEvidence['visibility'], positioning: item.dom.positioning as FrontendElementDomEvidence['positioning'], transformed: item.dom.transformed };
    }
    return { id: text(item.id), ...(text(item.type) ? { type: text(item.type) } : {}), ...(item.parentId === null || typeof item.parentId === 'string' ? { parentId: item.parentId as string | null } : {}), ...(record(item.fields) ? { fields: item.fields } : {}), ...(dom ? { dom } : {}) };
  });
  return { siteId: text(value.siteId), route: text(value.route), frontendId: text(value.frontendId), frontendVersion: text(value.frontendVersion), breakpoint: text(value.breakpoint), complete: value.complete === true && (!domCapture || (domCapture.limitations.length === 0 && domCapture.expectedCount === elements.length && Boolean(text(value.revision)))), revision: text(value.revision) || undefined, elements, ...(domCapture ? { domCapture } : {}) };
}
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  if (record(a) && record(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => own(b, key) && equal(a[key], b[key]));
  return false;
};
const valueAt = (input: unknown, path: string): unknown => {
  let value = input;
  for (const key of path.split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || (!record(value) && !Array.isArray(value)) || !own(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
};
export function buildFrontendCompatibilityReport(input: {
  siteId: string; route: string; revision?: string; content: unknown;
  runtime?: FrontendRuntimeDeclaration; observation?: FrontendObservation;
  design?: { tokens?: Record<string, unknown>; chrome?: Record<string, unknown> };
}): FrontendCompatibilityReport {
  const content = record(input.content) ? input.content : {};
  const doc = record(content.contentDocument) ? content.contentDocument : {};
  const rootPath = Array.isArray(content.elements) ? '/elements' : Array.isArray(doc.elements) ? '/contentDocument/elements' : '/';
  const roots = Array.isArray(content.elements) ? content.elements : Array.isArray(doc.elements) ? doc.elements : Array.isArray(input.content) ? input.content : [];
  const issues: FrontendCompatibilityIssue[] = [];
  const elements: Array<{ element: Record<string, unknown>; path: string; parentId: string | null }> = [];
  let requirementCount = 0;
  const issue = (entry: Omit<FrontendCompatibilityIssue, 'route'>) => issues.push({ ...entry, route: input.route, expected: safeValue(entry.expected), observed: safeValue(entry.observed) });
  const need = (capability: string, path: string, id?: string, breakpoint?: string) => {
    requirementCount++;
    const state = input.runtime?.capabilities[capability];
    if (state === 'supported') return;
    issue({ code: 'capability.' + (state || 'unverified'), status: state || 'unverified', contentPath: path, elementId: id, breakpoint, capability, expected: 'supported', observed: state || 'undeclared', evidence: state ? 'declaration' : 'none', repairOwner: state ? 'custom-frontend' : 'verification', suggestedAction: state === 'fallback' ? 'Implement the full runtime or explicitly accept this fallback.' : state === 'unsupported' ? 'Implement this capability in the frontend adapter.' : 'Declare frontend support and supply matching runtime observations.' });
  };
  let visited = 0;
  const rich = (nodes: unknown[], path: string, id?: string, depth = 0) => {
    if (depth > 64) throw new Error('Content nesting exceeds the compatibility limit.');
    nodes.forEach((node, index) => {
      if (++visited > 10000) throw new Error('Content exceeds 10000 nodes; report was not truncated.');
      if (!record(node)) return;
      const pointer = path + '/' + index;
      if (text(node.type)) need('richText.' + text(node.type), pointer, id);
      for (const mark of ['bold', 'italic', 'underline', 'strikethrough', 'code', 'superscript', 'subscript']) if (node[mark]) need('richText.mark.' + mark, pointer + '/' + mark, id);
      if (Array.isArray(node.children)) rich(node.children, pointer + '/children', id, depth + 1);
      if (node.type === 'interactive_component') component(node, pointer, id);
    });
  };
  const component = (props: Record<string, unknown>, path: string, id?: string) => {
    const key = text(props.componentKey); const version = text(props.componentVersion) || text(props.version);
    if (!key) return;
    const declared = input.runtime?.componentVersions;
    const supported = declared && own(declared, key) ? declared[key] : undefined;
    if (!supported?.includes(version)) issue({ code: 'component.version.' + (supported ? 'unsupported' : 'unverified'), status: supported ? 'unsupported' : 'unverified', contentPath: path, elementId: id, expected: { componentKey: key, version }, observed: supported || 'undeclared', evidence: supported ? 'declaration' : 'none', repairOwner: supported ? 'custom-frontend' : 'verification', suggestedAction: 'Declare and implement this exact registered component key/version, preserving its fallback.' });
  };
  const walk = (nodes: unknown[], path: string, parentId: string | null, depth = 0, parentLayouts: Record<string, BackyChildLayout> = { desktop: 'free' }) => {
    if (depth > 64) throw new Error('Content nesting exceeds the compatibility limit.');
    nodes.forEach((value, index) => {
      if (++visited > 10000) throw new Error('Content exceeds 10000 nodes; report was not truncated.');
      if (!record(value)) return;
      const pointer = path + '/' + index; const id = text(value.id) || undefined;
      elements.push({ element: value, path: pointer, parentId });
      if (!id) issue({ code: 'registration.element-id.missing', status: 'missing', contentPath: pointer + '/id', evidence: 'none', repairOwner: 'registration', suggestedAction: 'Register a stable element ID to make this location addressable.' });
      const type = text(value.type); if (type) need('element.' + type, pointer + '/type', id);
      const props = record(value.props) ? value.props : {}; const styles = record(value.styles) ? value.styles : {};
      if (Array.isArray(props.content)) rich(props.content, pointer + '/props/content', id);
      if (record(value.animation)) { need('motion.' + text(value.animation.type), pointer + '/animation/type', id); need('motion.trigger.' + (text(value.animation.trigger) || 'load'), pointer + '/animation/trigger', id); }
      if (record(value.responsive) && Object.keys(value.responsive).length) need('layout.breakpoints', pointer + '/responsive', id);
      // Match the shared renderer, including CSS precedence, parent flow and breakpoint overrides.
      // Saved x/y on a flow child are its free-position fallback, not a runtime requirement.
      const responsive = record(value.responsive) ? value.responsive : {};
      const childLayouts: Record<string, BackyChildLayout> = {};
      const layoutRequirements = new Set<string>();
      for (const breakpoint of new Set(['desktop', ...Object.keys(parentLayouts), ...Object.keys(responsive)])) {
        const override = breakpoint !== 'desktop' && record(responsive[breakpoint]) ? responsive[breakpoint] as Record<string, unknown> : {};
        const effective = { ...value, ...override, x: typeof (override.x ?? value.x) === 'number' ? (override.x ?? value.x) as number : undefined, y: typeof (override.y ?? value.y) === 'number' ? (override.y ?? value.y) as number : undefined, props: { ...props, ...(record(override.props) ? override.props : {}) }, styles: { ...styles, ...(record(override.styles) ? override.styles : {}) } };
        const layout = resolveBackyChildLayout(effective);
        childLayouts[breakpoint] = layout;
        const prefix = Object.keys(override).length ? pointer + '/responsive/' + breakpoint : pointer;
        const requireLayout = (capability: string, location: string) => {
          if (!layoutRequirements.has(capability)) { layoutRequirements.add(capability); need(capability, location, id, breakpoint === 'desktop' ? undefined : breakpoint); }
        };
        if (layout !== 'free') {
          const source = effective.props.layout === 'free' ? '/props/layout' : effective.styles.display !== undefined ? '/styles/display' : effective.props.display !== undefined ? '/props/display' : '/props/layout';
          requireLayout('layout.' + layout, prefix + source);
        }
        if (!isBackyFlowChild(effective, parentLayouts[breakpoint] ?? parentLayouts.desktop ?? 'free') && (typeof effective.x === 'number' || typeof effective.y === 'number')) requireLayout('layout.free', prefix);
      }
      if (props.fontFamily || styles.fontFamily || value.tokenRefs) need('design.tokens', pointer, id);
      if (value.dataBindings || props.dataBindings) need('data.bindings', pointer + '/dataBindings', id);
      if (text(value.componentKey)) component(value, pointer, id);
      else component(props, pointer + '/props', id);
      if (Array.isArray(value.children)) walk(value.children, pointer + '/children', id || parentId, depth + 1, childLayouts);
    });
  };
  if (Array.isArray(input.content) && roots.every(node => record(node) && !record(node.props) && (Array.isArray(node.children) || typeof node.text === 'string'))) rich(roots, '', undefined);
  else walk(roots, rootPath, null);
  if (!roots.length) issue({ code: 'registration.elements.missing', status: 'missing', contentPath: rootPath, evidence: 'none', repairOwner: 'registration', suggestedAction: 'Register a concrete editable element tree; metadata alone does not import the page.' });
  const ids = new Set<string>();
  for (const { element, path } of elements) { const id = text(element.id); if (id && ids.has(id)) issue({ code: 'registration.element-id.duplicate', status: 'mismatch', contentPath: path + '/id', elementId: id, evidence: 'none', repairOwner: 'registration', suggestedAction: 'Assign unique stable IDs before comparing frontend mappings.' }); ids.add(id); }
  if (record(input.design?.tokens?.fonts) && Object.keys(input.design!.tokens!.fonts as object).length) need('design.fonts', '/frontendDesign/tokens/fonts');
  if (record(input.design?.chrome) && Object.values(input.design!.chrome!).some(value => record(value) && Object.keys(value).length > 0)) need('design.chrome', '/frontendDesign/chrome');
  for (const [capability, names] of [['design.customCSS', ['customCSS', 'customCss']], ['runtime.customJS', ['customJS', 'customJs']], ['motion.timelines', ['animations']], ['runtime.interactions', ['interactions']]] as const) {
    const locations: Array<[Record<string, unknown>, string]> = [[content, ''], [doc, '/contentDocument'], [record(content.metadata) ? content.metadata : {}, '/metadata'], [record(doc.metadata) ? doc.metadata : {}, '/contentDocument/metadata']];
    let found = false;
    for (const [owner, prefix] of locations) {
      for (const name of names) if (owner[name] && (!record(owner[name]) || Object.keys(owner[name] as object).length)) { need(capability, prefix + '/' + name); found = true; break; }
      if (found) break;
    }
  }
  const observation = input.observation;
  if (observation?.domCapture) {
    issue({ code: 'observations.dom.scope.unverified', status: 'unverified', contentPath: '/observations/domCapture', breakpoint: observation.breakpoint, evidence: 'supplied-observation', repairOwner: 'verification', observed: { ...observation.domCapture, coverage: observation.complete ? 'complete-marked-tree' : 'incomplete', elements: observation.elements.filter(element => element.dom).map(element => ({ id: element.id, dom: element.dom })) }, suggestedAction: 'DOM capture verifies only marked rendered IDs, DOM parents and explicitly mapped CSS geometry at this viewport. Verify hidden states, animations and interactions separately.' });
  }
  const identityMatches = !observation || (observation.siteId === input.siteId && observation.route === input.route && observation.frontendId === input.runtime?.frontendId && observation.frontendVersion === input.runtime?.version);
  if (observation && !identityMatches) issue({ code: 'observations.identity.unverified', status: 'unverified', contentPath: '/observations', evidence: 'supplied-observation', repairOwner: 'verification', suggestedAction: 'Supply inventory for this site, route and declared frontend ID/version.' });
  const fresh = observation && identityMatches && Boolean(input.revision) && observation.revision === input.revision;
  if (observation && !fresh) issue({ code: 'observations.revision.unverified', status: 'unverified', contentPath: '/revision', expected: input.revision, observed: observation.revision, evidence: 'supplied-observation', repairOwner: 'verification', suggestedAction: 'Capture observations from the same saved content revision before comparison.' });
  if (fresh && observation) {
    const observed = new Map(observation.elements.map(element => [element.id, element]));
    for (const { element, path, parentId } of elements) {
      const id = text(element.id); if (!id) continue;
      const found = observed.get(id);
      if (!found) { issue({ code: 'renderer.element.' + (observation.complete ? 'missing' : 'unverified'), status: observation.complete ? 'missing' : 'unverified', elementId: id, contentPath: path, breakpoint: observation.breakpoint, evidence: 'supplied-observation', repairOwner: observation.complete ? 'custom-frontend' : 'verification', suggestedAction: observation.complete ? 'Render the missing registered element with its stable ID.' : 'Supply a complete inventory or observations for this element.' }); continue; }
      const comparisons: Array<[string, unknown, unknown]> = [];
      if (found.type !== undefined) comparisons.push(['type', element.type, found.type]);
      if (found.parentId !== undefined) comparisons.push(['parentId', parentId, found.parentId]);
      const override = record(element.responsive) && record(element.responsive[observation.breakpoint]) ? element.responsive[observation.breakpoint] as Record<string, unknown> : {};
      const expected = { ...element, ...override, props: { ...(record(element.props) ? element.props : {}), ...(record(override.props) ? override.props : {}) }, styles: { ...(record(element.styles) ? element.styles : {}), ...(record(override.styles) ? override.styles : {}) }, tokenRefs: { ...(record(element.tokenRefs) ? element.tokenRefs : {}), ...(record(override.tokenRefs) ? override.tokenRefs : {}) } };
      for (const [field, actual] of Object.entries(found.fields || {})) {
        if (!/^(props|styles|animation|responsive|tokenRefs|dataBindings|bindingSlots|accessibility|x|y|width|height|zIndex|rotation|visible|locked|actions|assetIds|componentKey|version|renderCapabilities|fallback)(\.|$)/.test(field) || field.split('.').some(key => forbidden.test(key))) { issue({ code: 'observations.field.unverified', status: 'unverified', contentPath: path + '/' + field.replace(/\./g, '/'), elementId: id, breakpoint: observation.breakpoint, evidence: 'supplied-observation', repairOwner: 'verification', suggestedAction: 'This field is outside the safe comparison schema; verify it separately.' }); continue; }
        comparisons.push([field, valueAt(expected, field), actual]);
      }
      if (found.type === undefined || found.parentId === undefined || !found.fields || Object.keys(found.fields).length === 0) issue({ code: 'observations.element.incomplete', status: 'unverified', elementId: id, contentPath: path, breakpoint: observation.breakpoint, evidence: 'supplied-observation', repairOwner: 'verification', suggestedAction: 'Supply type, parentId and editable-field observations for this element.' });
      for (const [field, wanted, actual] of comparisons) if (!equal(wanted, actual)) issue({ code: 'renderer.property.mismatch', status: 'mismatch', elementId: id, contentPath: path + '/' + field.replace(/\./g, '/'), breakpoint: observation.breakpoint, expected: wanted, observed: actual, evidence: 'supplied-observation', repairOwner: 'custom-frontend', suggestedAction: 'Align the frontend mapping with this registered field and breakpoint.' });
    }
    for (const found of observation.elements) if (!ids.has(found.id)) issue({ code: 'registration.element.unregistered', status: 'missing', elementId: found.id, contentPath: '/elements', breakpoint: observation.breakpoint, evidence: 'supplied-observation', repairOwner: 'registration', suggestedAction: 'Register this frontend child or remove its claim to be an editable Backy element.' });
  }
  if (!observation) issue({ code: 'runtime.observations.unverified', status: 'unverified', contentPath: '/observations', evidence: 'none', repairOwner: 'verification', suggestedAction: 'Supply a same-revision rendered element inventory and verify interactions in the browser.' });
  return { schemaVersion: 'backy.frontend-compatibility-report.v1', siteId: input.siteId, route: input.route, revision: input.revision, frontend: input.runtime || null, certification: 'not-live-certified', summary: { elementCount: elements.length, requirementCount, issueCount: issues.length, blocking: issues.filter(entry => ['missing', 'mismatch', 'unsupported'].includes(entry.status)).length, unverified: issues.filter(entry => entry.status === 'unverified').length, fallbacks: issues.filter(entry => entry.status === 'fallback').length }, issues, nextAction: 'Repair listed mappings, then capture matching revision observations and test actual rendering/interactions. Declarations and supplied observations are not independent live certification.' };
}
