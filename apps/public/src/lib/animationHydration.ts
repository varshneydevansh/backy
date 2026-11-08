import { normalizeBackyAnimationSequence, backyAnimationSequenceFinalState, type BackyAnimationSequence } from '../../../../packages/core/src/animation-sequence';
import type gsap from 'gsap';

type Properties = Record<string, unknown>;
export interface HydratedAnimationConfig {
    sequence?: BackyAnimationSequence;
    type: 'fadeIn' | 'slideIn' | 'scaleIn' | 'bounce' | 'rotate' | 'custom';
    duration: number;
    delay: number;
    easing: string;
    direction?: string;
    trigger: 'load' | 'scroll' | 'hover';
    from: Properties;
    to: Properties;
    scrollTrigger: { start: string; end: string; scrub: boolean };
}
const record = (value: unknown): Properties => value && typeof value === 'object' && !Array.isArray(value) ? value as Properties : {};
const nonnegative = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value : fallback;

export function parseAnimationConfig(raw: string): HydratedAnimationConfig | undefined {
    const input = record(JSON.parse(raw));
    if (!['fadeIn', 'slideIn', 'scaleIn', 'bounce', 'rotate', 'custom'].includes(String(input.type))) return undefined;
    const sequence = input.sequence === undefined ? undefined : normalizeBackyAnimationSequence(input.sequence);
    if (input.sequence !== undefined && !sequence) return undefined;
    const scroll = record(input.scrollTrigger);
    return {
        ...(sequence ? { sequence } : {}),
        type: input.type as HydratedAnimationConfig['type'],
        duration: nonnegative(input.duration, 0.6), delay: nonnegative(input.delay, 0),
        easing: text(input.easing, input.type === 'bounce' ? 'bounce.out' : 'power2.out'),
        direction: typeof input.direction === 'string' ? input.direction : 'up',
        trigger: input.trigger === 'scroll' || input.trigger === 'hover' ? input.trigger : 'load',
        from: record(input.from), to: record(input.to),
        scrollTrigger: { start: text(scroll.start, 'top 80%'), end: text(scroll.end, 'bottom 20%'), scrub: scroll.scrub === true },
    };
}

/** Read the element's resting values before GSAP changes its inline styles. */
export function animationEndpoints(config: HydratedAnimationConfig, read: (key: string) => unknown) {
    const current = (key: string, fallback: number) => {
        const value = read(key);
        const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
        return Number.isFinite(numeric) ? numeric : fallback;
    };
    const from: Properties = {};
    const to: Properties = {};
    if (config.type === 'custom') {
        Object.assign(from, config.from);
        // A from-only property returns to its authored/computed resting value.
        for (const key of Object.keys(from)) to[key] = read(key);
    } else {
        const opacity = current('opacity', 1);
        const entranceOpacity = config.trigger === 'hover' ? opacity * 0.75 : 0;
        if (['fadeIn', 'slideIn', 'scaleIn', 'rotate'].includes(config.type)) {
            from.opacity = entranceOpacity; to.opacity = opacity;
        }
        if (config.type === 'slideIn') {
            const horizontal = config.direction === 'left' || config.direction === 'right';
            const key = horizontal ? 'x' : 'y';
            const resting = current(key, 0);
            from[key] = resting + (config.direction === 'left' || config.direction === 'down' ? -50 : 50);
            to[key] = resting;
        } else if (config.type === 'scaleIn') {
            from.scale = current('scale', 1) * 0.8; to.scale = current('scale', 1);
        } else if (config.type === 'bounce') {
            from.y = current('y', 0) - 20; to.y = current('y', 0);
        } else if (config.type === 'rotate') {
            from.rotation = current('rotation', 0) - 180; to.rotation = current('rotation', 0);
        }
    }
    // Explicit endpoints take precedence over preset values, including zero.
    Object.assign(from, config.from);
    Object.assign(to, config.to);
    return { from, to };
}

type AnimationEngine = Pick<typeof gsap, 'context' | 'getProperty' | 'fromTo' | 'set' | 'timeline'>;
export interface HydrationOptions {
    root: Document | Element;
    engine: AnimationEngine;
    /** Optional editor/embed viewport; omitted public hosts keep document scrolling. */
    scroller?: Element;
    media?: MediaQueryList;
    createObserver?: (callback: MutationCallback) => MutationObserver;
    reportError?: (error: unknown) => void;
}

const hosts = new WeakMap<Document | Element, { references: number; dispose: () => void }>();

/** Overlapping client-route hosts share ownership until the last effect unmounts. */
export function acquireAnimationHydration(options: HydrationOptions): () => void {
    let host = hosts.get(options.root);
    if (!host) {
        host = { references: 0, dispose: installAnimationHydration(options) };
        hosts.set(options.root, host);
    }
    host.references += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (--host.references === 0) {
            host.dispose(); hosts.delete(options.root);
        }
    };
}

/** Own only the contexts created here; unrelated widgets retain their GSAP state. */
export function installAnimationHydration({ root, engine, scroller, media = window.matchMedia('(prefers-reduced-motion: reduce)'),
    createObserver = (callback) => new MutationObserver(callback), reportError = (error) => console.error('Invalid Backy animation:', error) }: HydrationOptions): () => void {
    const entries = new Map<Element, { raw: string; dispose: () => void }>();
    let disposed = false;
    const release = (element: Element) => { entries.get(element)?.dispose(); entries.delete(element); };
    const hydrate = (element: Element, raw: string) => {
        let context: gsap.Context | undefined;
        const listeners: Array<() => void> = [];
        try {
            const config = parseAnimationConfig(raw);
            if (!config) return () => {};
            const { from, to } = animationEndpoints(config, (key) => engine.getProperty(element, key));
            context = engine.context(() => {}, element);
            context.add(() => {
                if (media.matches) {
                    // No hidden entrance state, listener or ScrollTrigger in reduced motion.
                    engine.set(element, config.sequence ? backyAnimationSequenceFinalState(config.sequence) : to);
                    return;
                }
                const triggerOptions = {
                    ...(config.trigger === 'hover' ? { paused: true } : {}),
                    ...(config.trigger === 'scroll' ? { scrollTrigger: { trigger: element, ...config.scrollTrigger, ...(scroller ? { scroller } : {}) } } : {}),
                };
                const tween = config.sequence
                    ? engine.timeline({ delay: config.delay, ...triggerOptions })
                    : engine.fromTo(element, from, { ...to, duration: config.duration, delay: config.delay, ease: config.easing, ...triggerOptions });
                if (config.sequence) {
                    const timeline = tween as gsap.core.Timeline;
                    [...config.sequence.steps].sort((a, b) => a.at - b.at).forEach((step, index) => {
                        const vars = { ...step.to, duration: step.duration, ease: step.easing || config.easing, immediateRender: false };
                        if (step.from) {
                            const from = Object.fromEntries(Object.entries(step.from).filter(([key]) => key in step.to));
                            timeline.fromTo(element, from, { ...vars, immediateRender: index === 0 }, step.at);
                        }
                        else timeline.to(element, vars, step.at);
                    });
                }
                if (config.trigger === 'hover') {
                    let hovering = false;
                    let focused = element.contains(element.ownerDocument.activeElement);
                    const update = () => { if (hovering || focused) tween.play(); else tween.reverse(); };
                    const bind = (name: string, handler: EventListener) => {
                        element.addEventListener(name, handler);
                        listeners.push(() => element.removeEventListener(name, handler));
                    };
                    bind('mouseenter', () => { hovering = true; update(); });
                    bind('mouseleave', () => { hovering = false; update(); });
                    bind('focusin', () => { focused = true; update(); });
                    bind('focusout', (event) => { focused = element.contains((event as FocusEvent).relatedTarget as Node | null); update(); });
                    if (focused) update();
                }
            });
        } catch (error) {
            listeners.forEach((remove) => remove()); context?.revert(); reportError(error);
            return () => {};
        }
        return () => { listeners.forEach((remove) => remove()); context?.revert(); };
    };
    const reconcile = () => {
        if (disposed) return;
        const nodes = new Set<Element>(root.querySelectorAll('[data-animation]'));
        if (root.nodeType === 1 && (root as Element).hasAttribute('data-animation')) nodes.add(root as Element);
        for (const element of entries.keys()) if (!nodes.has(element)) release(element);
        for (const element of nodes) {
            const raw = element.getAttribute('data-animation') || '';
            if (entries.get(element)?.raw === raw) continue;
            release(element);
            entries.set(element, { raw, dispose: hydrate(element, raw) });
        }
    };
    const motionChange = () => { for (const element of [...entries.keys()]) release(element); reconcile(); };
    const observer = createObserver(reconcile);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-animation'] });
    media.addEventListener('change', motionChange);
    reconcile();
    return () => {
        disposed = true; observer.disconnect(); media.removeEventListener('change', motionChange);
        for (const element of [...entries.keys()]) release(element);
    };
}
