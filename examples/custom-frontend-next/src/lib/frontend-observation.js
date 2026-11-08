/** Portable, opt-in DOM evidence capture. Reads only public identity markers and geometry.
 * No network, textContent, URLs, inputs, cookies, storage, raw props or animation values. */
export function captureBackyFrontendDom(root, options = {}) {
  const reasons = new Set();
  const add = reason => reasons.add(reason);
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/@+-]{0,199}$/.test(value) ? value : '';
  const attr = name => root.getAttribute(name) || '';
  const siteId = identifier(attr('data-backy-site-id'));
  const routeValue = attr('data-backy-route');
  const route = /^\/[^?#\s]*$/.test(routeValue) && routeValue.length <= 1000 ? routeValue : '';
  const frontendId = identifier(attr('data-backy-frontend-id'));
  const frontendVersion = identifier(attr('data-backy-frontend-version'));
  const revision = identifier(attr('data-backy-revision'));
  const view = root.ownerDocument.defaultView;
  const width = view.innerWidth, height = view.innerHeight;
  const breakpoint = width <= 767 ? 'mobile' : width <= 1024 ? 'tablet' : 'desktop';
  const maximum = Math.min(10000, Math.max(1, Number.isInteger(options.maxElements) ? options.maxElements : 10000));
  const expected = options.expectedIds;
  const expectedBounded = Array.isArray(expected) && expected.length <= 10000;
  const expectedIds = new Set(expectedBounded ? expected.filter(identifier) : []);
  if (!expectedBounded || expected.length !== expectedIds.size) add('expected-inventory.unknown');
  if (!siteId || !route || !frontendId || !frontendVersion) add('identity.missing');
  if (!revision) add('revision.missing');
  if (root.querySelector('[data-backy-site-id][data-backy-route]')) add('mapping.unknown');
  if (root.querySelector('iframe')) add('iframe.unobserved');
  const seen = new Map(), duplicates = new Set();
  let count = 0;
  // Walk only marked nodes in this exact root. TreeWalker avoids an unbounded querySelectorAll allocation.
  const walker = root.ownerDocument.createTreeWalker(root, 1);
  let node, walked = 0;
  while ((node = walker.nextNode())) {
    if (++walked > 100000) { add('dom-walk.limit'); break; }
    if (node.localName?.includes('-')) add('shadow-dom.unobserved');
    if (!node.hasAttribute('data-backy-element-id')) continue;
    if (++count > maximum) { add('inventory.limit'); break; }
    const id = identifier(node.getAttribute('data-backy-element-id'));
    if (!id) { add('element-id.invalid'); continue; }
    if (seen.has(id)) { duplicates.add(id); add('element-id.duplicate'); continue; }
    seen.set(id, node);
  }
  const elements = [];
  let estimatedBytes = 2000;
  for (const [id, element] of seen) {
    if (duplicates.has(id)) continue;
    const type = identifier(element.getAttribute('data-backy-element-type'));
    if (!type) add('element-type.unknown');
    const parent = element.parentElement?.closest('[data-backy-element-id]');
    const parentId = parent && root.contains(parent) ? identifier(parent.getAttribute('data-backy-element-id')) : null;
    if (parent && (!parentId || duplicates.has(parentId))) { add('parent.ambiguous'); continue; }
    const css = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const transformed = css.transform !== 'none' || css.translate !== 'none' || css.rotate !== 'none' || css.scale !== 'none';
    const hidden = css.display === 'none' || css.visibility !== 'visible' || css.opacity === '0' || element.getClientRects().length === 0;
    if (hidden) add('visibility.hidden');
    // Computed offsets are local CSS values, never viewport rectangles. Explicit mapping markers
    // name only the geometry fields applied by this renderer; auto/flow/transformed states stay evidence.
    const fields = {};
    const mappings = (element.getAttribute('data-backy-observe-geometry') || '').split(',');
    if (!hidden && !transformed && css.position === 'absolute' && element.offsetParent === (parent || root)) {
      const properties = { x: 'left', y: 'top', width: 'width', height: 'minHeight' };
      for (const field of mappings) {
        if (!Object.prototype.hasOwnProperty.call(properties, field)) continue;
        const raw = css[properties[field]];
        if (/^-?\d+(\.\d+)?px$/.test(raw) && Number.isInteger(Number.parseFloat(raw))) fields[field] = Number.parseFloat(raw);
        else add('geometry.unmapped');
      }
    } else if (mappings.some(Boolean)) add('geometry.unmapped');
    const coords = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    if (!Object.values(coords).every(value => Number.isFinite(value) && Math.abs(value) <= 10000000)) { add('geometry.invalid'); continue; }
    const item = { id, ...(type ? { type } : {}), parentId, ...(Object.keys(fields).length ? { fields } : {}),
      dom: { rect: coords, visibility: hidden ? 'hidden' : 'rendered', positioning: ['absolute','fixed','relative','static','sticky'].includes(css.position) ? css.position : 'unknown', transformed } };
    estimatedBytes += JSON.stringify(item).length * 2;
    if (estimatedBytes > 220000) { add('inventory.byte-limit'); break; }
    elements.push(item);
  }
  const actualIds = new Set(elements.map(element => element.id));
  if ([...expectedIds].some(id => !actualIds.has(id))) add('expected-element.absent');
  if (elements.some(element => !expectedIds.has(element.id))) add('element.unregistered');
  if (root.querySelector('[data-backy-observation-unknown]')) add('mapping.unknown');
  const domCapture = { schemaVersion: 'backy.frontend-dom-evidence.v1', source: 'browser-dom', capturedAt: new Date().toISOString(), viewport: { width, height }, expectedCount: Math.min(expectedIds.size, 10000), capturedCount: elements.length, limitations: [...reasons] };
  return { schemaVersion: 'backy.frontend-dom-capture.v1', observation: siteId && route && frontendId && frontendVersion ? { siteId, route, frontendId, frontendVersion, ...(revision ? { revision } : {}), breakpoint, complete: reasons.size === 0, elements, domCapture } : null,
    ...(!siteId || !route || !frontendId || !frontendVersion ? { unverifiedDom: { breakpoint, elements, domCapture } } : {}),
    limitations: [...reasons], evidence: 'Marked DOM at one viewport; hidden states, animations and interactions are not certified.' };
}
