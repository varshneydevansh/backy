import assert from 'node:assert/strict';
import gsap from 'gsap';
import { acquireAnimationHydration, animationEndpoints, installAnimationHydration, parseAnimationConfig } from '../src/lib/animationHydration';

const config = (input: Record<string, unknown>) => parseAnimationConfig(JSON.stringify({ type: 'fadeIn', duration: 1, ...input }))!;
const custom = config({ type: 'custom', from: { x: 20, opacity: 0.2, rotation: 15 }, to: { x: 150, opacity: 0.4, rotation: 75, scale: 0.5 } });
const endpoints = animationEndpoints(custom, () => 0);
assert.deepEqual(endpoints.from, custom.from);
assert.deepEqual(endpoints.to, custom.to);
const target = { x: 7, opacity: 1, rotation: 0, scale: 1 };
const realContext = gsap.context(() => {
    const tween = gsap.fromTo(target, endpoints.from, { ...endpoints.to, duration: 1, paused: true });
    tween.progress(1);
    assert.equal(target.x, 150); assert.equal(target.opacity, 0.4); assert.equal(target.rotation, 75); assert.equal(target.scale, 0.5);
    tween.reverse().progress(0);
    assert.equal(target.x, 20); assert.equal(target.opacity, 0.2);
});
realContext.revert();
assert.equal(target.x, 7, 'The real GSAP context restores the authored baseline');
gsap.ticker.sleep();
assert.equal(animationEndpoints(config({ type: 'rotate' }), (key) => key === 'rotation' ? 35 : 0.8).to.rotation, 35);
assert.equal(animationEndpoints(config({ type: 'custom', from: { x: 20 } }), () => 7).to.x, 7, 'From-only custom animations return to their resting values');
assert.equal(animationEndpoints(config({ type: 'slideIn', direction: 'left' }), (key) => key === 'x' ? 12 : 1).from.x, -38);
assert.equal(parseAnimationConfig('{"type":"none"}'), undefined);
assert.equal(config({ duration: -1, delay: null }).duration, 0.6);
assert.equal(config({ duration: 0 }).duration, 0);

// Exercise the production lifecycle with controlled DOM, media and engine adapters.
// These assert behavior, ownership and events; they do not claim browser paint proof.
class TestElement {
    raw: string | null;
    listeners = new Map<string, Set<EventListener>>();
    ownerDocument = { activeElement: null as unknown };
    values: Record<string, unknown> = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 35 };
    constructor(input: Record<string, unknown>) { this.raw = JSON.stringify(input); }
    getAttribute() { return this.raw; }
    contains(node: unknown) { return node === this; }
    addEventListener(name: string, fn: EventListener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name)!.add(fn); }
    removeEventListener(name: string, fn: EventListener) { this.listeners.get(name)?.delete(fn); }
    emit(name: string, relatedTarget: unknown = null) { this.listeners.get(name)?.forEach((fn) => fn({ relatedTarget } as unknown as Event)); }
    listenerCount() { return [...this.listeners.values()].reduce((count, set) => count + set.size, 0); }
}
const load = new TestElement({ type: 'custom', duration: 1, from: { x: 20 }, to: { x: 150, opacity: 0.4 } });
const hover = new TestElement({ type: 'fadeIn', duration: 1, trigger: 'hover' });
const scroll = new TestElement({ type: 'slideIn', duration: 1, trigger: 'scroll' });
let nodes = [load, hover, scroll];
const root = { nodeType: 9, querySelectorAll: () => nodes.filter((node) => node.raw !== null) };
const mediaHandlers = new Set<() => void>();
const media = { matches: false, addEventListener: (_name: string, fn: () => void) => mediaHandlers.add(fn), removeEventListener: (_name: string, fn: () => void) => mediaHandlers.delete(fn) };
type Call = { element: TestElement; from?: Record<string, unknown>; to: Record<string, unknown>; plays: number; reverses: number; reverted: boolean };
const calls: Call[] = [];
let ownedCalls: Call[] = [];
let mutation: () => void = () => {};
let disconnected = false;
let observerOptions: MutationObserverInit | undefined;
const errors: unknown[] = [];
const engine = {
    getProperty: (element: TestElement, key: string) => element.values[key],
    context: () => {
        const localCalls: Call[] = []; const snapshots = new Map<TestElement, Record<string, unknown>>();
        return {
            add: (fn: () => void) => {
                const previous = ownedCalls; ownedCalls = localCalls;
                for (const node of nodes) snapshots.set(node, { ...node.values });
                try { fn(); } finally { ownedCalls = previous; }
            },
            revert: () => { for (const call of localCalls) { call.reverted = true; call.element.values = { ...snapshots.get(call.element)! }; } },
        };
    },
    fromTo: (element: TestElement, from: Record<string, unknown>, to: Record<string, unknown>) => {
        const call = { element, from, to, plays: 0, reverses: 0, reverted: false }; calls.push(call); ownedCalls.push(call);
        Object.assign(element.values, from);
        return { play: () => { call.plays++; }, reverse: () => { call.reverses++; } };
    },
    set: (element: TestElement, to: Record<string, unknown>) => {
        const call = { element, to, plays: 0, reverses: 0, reverted: false }; calls.push(call); ownedCalls.push(call); Object.assign(element.values, to);
    },
};
const dispose = installAnimationHydration({ root: root as unknown as Document, engine: engine as unknown as typeof gsap,
    media: media as unknown as MediaQueryList, reportError: (error) => errors.push(error), createObserver: (fn) => {
        mutation = () => fn([], {} as MutationObserver);
        return { observe: (_root: unknown, options: MutationObserverInit) => { observerOptions = options; }, disconnect: () => { disconnected = true; } } as unknown as MutationObserver;
    } });
const customCall = calls[0], hoverCall = calls[1], scrollCall = calls[2];
assert.equal(customCall.to.x, 150); assert.equal(customCall.to.opacity, 0.4);
assert.equal(hoverCall.to.opacity, 1); assert.equal(hoverCall.from!.opacity, 0.75, 'Hover presets never begin invisible');
assert.equal(hoverCall.to.paused, true);
assert.deepEqual(scrollCall.to.scrollTrigger, { trigger: scroll, start: 'top 80%', end: 'bottom 20%', scrub: false });
hover.emit('focusin'); assert.equal(hoverCall.plays, 1);
hover.emit('mouseenter'); hover.emit('focusout'); assert.equal(hoverCall.reverses, 0, 'Mouse presence keeps the focused tween active');
hover.emit('mouseleave'); assert.equal(hoverCall.reverses, 1);
hover.emit('focusin'); hover.emit('focusout', hover); assert.equal(hoverCall.reverses, 1, 'Moving focus within the layer retains motion');
hover.emit('focusout'); assert.equal(hoverCall.reverses, 2);
mutation(); assert.equal(calls.length, 3, 'Unrelated content mutations do not replay unchanged animations');
assert.deepEqual(observerOptions!.attributeFilter, ['data-animation']);

load.raw = JSON.stringify({ type: 'custom', duration: 2, to: { x: 250 } }); mutation();
assert(customCall.reverted); assert.equal(calls.at(-1)!.to.x, 250); assert.equal(hoverCall.reverted, false);
const newLayer = new TestElement({ type: 'rotate', duration: 1 }); nodes.push(newLayer); mutation();
assert.equal(calls.at(-1)!.to.rotation, 35, 'Newly rendered layers retain their authored rotation');
nodes = nodes.filter((node) => node !== hover); mutation();
assert(hoverCall.reverted); assert.equal(hover.listenerCount(), 0, 'Removed layers relinquish listeners and context');
const beforeReduction = calls.length; media.matches = true; mediaHandlers.forEach((fn) => fn());
const reduced = calls.slice(beforeReduction); assert.equal(reduced.length, nodes.length);
assert(reduced.every((call) => !call.from && !call.to.scrollTrigger && !call.to.paused), 'Reduced motion renders endpoints without tweens or triggers');
assert.equal(scroll.listenerCount(), 0);
media.matches = false; mediaHandlers.forEach((fn) => fn());
assert(reduced.every((call) => call.reverted), 'Preference changes restore baselines before starting fresh motion');
const invalid = new TestElement({ type: 'fadeIn' }); invalid.raw = '{invalid'; nodes.push(invalid); mutation();
assert.equal(errors.length, 1); mutation(); assert.equal(errors.length, 1, 'Invalid configs are isolated and do not repeatedly report');
invalid.raw = JSON.stringify({ type: 'fadeIn', duration: 1 }); mutation(); assert.equal(calls.at(-1)!.element, invalid, 'Corrected configs recover');
scroll.raw = null; mutation(); assert(calls.filter((call) => call.element === scroll).every((call) => call.reverted), 'Removing the marker restores owned styles');
dispose(); assert(disconnected); assert.equal(mediaHandlers.size, 0); assert(calls.every((call) => call.reverted));
const afterDispose = calls.length; mutation(); assert.equal(calls.length, afterDispose);
let observerCount = 0, disconnectCount = 0;
const options = { root: root as unknown as Document, engine: engine as unknown as typeof gsap, media: media as unknown as MediaQueryList,
    createObserver: () => { observerCount++; return { observe: () => {}, disconnect: () => { disconnectCount++; } } as unknown as MutationObserver; } };
const firstHost = acquireAnimationHydration(options), secondHost = acquireAnimationHydration(options);
assert.equal(observerCount, 1, 'Overlapping client route hosts do not duplicate animation ownership');
firstHost(); firstHost(); assert.equal(disconnectCount, 0, 'Unmounting one host leaves the other host active');
secondHost(); assert.equal(disconnectCount, 1); assert.equal(mediaHandlers.size, 0);
const strictRemount = acquireAnimationHydration(options); assert.equal(observerCount, 2, 'A StrictMode/remounted effect acquires a fresh disposed owner'); strictRemount();
// Embedded/editor scroll ownership is opt-in; hosted/public calls above retain default scroll semantics.
const previewScroller = { id: 'actual-preview-viewport' } as unknown as Element;
const previewScroll = new TestElement({ type: 'slideIn', trigger: 'scroll', scrollTrigger: { start: 'top 75%', end: 'bottom 25%', scrub: true } });
nodes = [previewScroll];
const previewRoot = { nodeType: 9, querySelectorAll: () => nodes } as unknown as Document;
const previewOwner = installAnimationHydration({ ...options, root: previewRoot, scroller: previewScroller });
const previewCall = calls.at(-1)!;
assert.deepEqual(previewCall.to.scrollTrigger, { trigger: previewScroll, start: 'top 75%', end: 'bottom 25%', scrub: true, scroller: previewScroller });
previewOwner(); assert(previewCall.reverted, 'Preview relinquishes only its owned ScrollTrigger/context');
assert.equal(scrollCall.to.scrollTrigger && (scrollCall.to.scrollTrigger as any).scroller, undefined, 'Public default does not acquire an editor scroller');
console.log('Animation hydration passed: real GSAP custom endpoints/reversal/revert, visible hover/focus, default scroll, owned lifecycle, content changes, removal, reduced motion, invalid-config recovery. Browser paint and scroll timing remain separate verification.');

// The actual timeline engine executes overlapping/data-only steps, rather than chained timers.
const sequence = { version: 1, steps: [
    { id: 'entrance', label: 'Entrance', at: 0, duration: 1, easing: 'linear', from: { x: 0, opacity: 0.2 }, to: { x: 100, opacity: 1 } },
    { id: 'turn', label: 'Turn while moving', at: 0.5, duration: 1, easing: 'linear', to: { rotation: 90 } },
    { id: 'settle', label: 'Settle', at: 1.5, duration: 0.5, easing: 'linear', to: { x: 25, scale: 0.8 } },
] };
const sequenceConfig = { type: 'custom', duration: 0.6, delay: 0.25, easing: 'linear', trigger: 'hover', sequence };
assert.deepEqual(config(sequenceConfig).sequence, sequence);
for (const invalidSequence of [
    { ...sequence, version: 2 }, { ...sequence, steps: [] }, { ...sequence, steps: Array.from({ length: 25 }, (_, i) => ({ ...sequence.steps[0], id: String(i) })) },
    { ...sequence, steps: [{ ...sequence.steps[0], at: -1 }] }, { ...sequence, steps: [{ ...sequence.steps[0], duration: 61 }] },
    { ...sequence, steps: [{ ...sequence.steps[0], at: 179, duration: 2 }] },
    { ...sequence, steps: [{ ...sequence.steps[0], to: { onComplete: 'alert(1)' } }] },
    { ...sequence, steps: [{ ...sequence.steps[0], to: { opacity: 1.5 } }] },
    { ...sequence, steps: [{ ...sequence.steps[0], to: { x: Infinity } }] },
    { ...sequence, steps: [sequence.steps[0], sequence.steps[0]] },
]) assert.equal(parseAnimationConfig(JSON.stringify({ ...sequenceConfig, sequence: invalidSequence })), undefined, 'Malformed sequences are refused whole, without a partial/legacy fallback');
const actualLayer = Object.assign(new TestElement(sequenceConfig), { x: 12, opacity: 0.9, rotation: 15, scale: 1 });
const actualTimelines: gsap.core.Timeline[] = [], timelineOptions: Record<string, unknown>[] = [];
nodes = [actualLayer];
const realEngine = {
    context: () => gsap.context(() => {}),
    getProperty: (element: any, key: string) => gsap.getProperty(element, key),
    set: gsap.set, fromTo: gsap.fromTo,
    timeline: (vars: gsap.TimelineVars) => { timelineOptions.push(vars); const result = gsap.timeline({ ...vars, paused: true, scrollTrigger: undefined }); actualTimelines.push(result); return result; },
};
const sequenceOwner = installAnimationHydration({ ...options, root: root as unknown as Document, engine: realEngine as unknown as typeof gsap });
const timeline = actualTimelines.at(-1)!;
assert.equal(timeline.duration(), 2); assert.equal(timeline.delay(), 0.25); assert.equal(timelineOptions.at(-1)!.paused, true);
assert.equal(timeline.getChildren().length, 3); assert.deepEqual(timeline.getChildren().map(child => child.startTime()), [0, 0.5, 1.5]);
timeline.seek(0.75); assert.equal(actualLayer.x, 75); assert.equal(actualLayer.rotation, 33.75, 'Overlapping second step reads its own property baseline');
timeline.progress(1); assert.equal(actualLayer.x, 25); assert.equal(actualLayer.opacity, 1); assert.equal(actualLayer.rotation, 90); assert.equal(actualLayer.scale, 0.8);
actualLayer.emit('focusin'); assert.equal(timeline.reversed(), false); actualLayer.emit('focusout'); assert.equal(timeline.reversed(), true);
timeline.progress(0); assert.equal(actualLayer.x, 0); assert.equal(actualLayer.opacity, 0.2);
media.matches = true; mediaHandlers.forEach(fn => fn());
assert.equal(actualLayer.x, 25); assert.equal(actualLayer.rotation, 90); assert.equal(actualLayer.opacity, 1); assert.equal(actualLayer.listenerCount(), 0);
assert.equal(actualTimelines.length, 1, 'Reduced motion creates no timeline'); assert.equal(timeline.getChildren().length, 0, 'Preference changes dispose owned timeline children');
sequenceOwner(); assert.equal(actualLayer.x, 12); assert.equal(actualLayer.rotation, 15); assert.equal(actualLayer.opacity, 0.9);
media.matches = false;
actualLayer.raw = JSON.stringify({ ...sequenceConfig, trigger: 'scroll', scrollTrigger: { start: 'top 75%', end: 'bottom 25%', scrub: true } });
const scrollingSequence = installAnimationHydration({ ...options, engine: realEngine as unknown as typeof gsap, root: root as unknown as Document, scroller: previewScroller });
assert.deepEqual(timelineOptions.at(-1)!.scrollTrigger, { trigger: actualLayer, start: 'top 75%', end: 'bottom 25%', scrub: true, scroller: previewScroller });
assert(actualTimelines.at(-1)!.getChildren().every(child => !child.vars.scrollTrigger), 'ScrollTrigger belongs only to the parent timeline');
scrollingSequence(); assert.equal(actualLayer.x, 12); assert.equal(actualLayer.listenerCount(), 0);
gsap.ticker.sleep();
console.log('Sequence hydration passed: bounded validation, real GSAP overlapping timing/final states/reversal, reduced-motion final state, owned child cleanup/baseline restoration and one parent scroll admission.');
