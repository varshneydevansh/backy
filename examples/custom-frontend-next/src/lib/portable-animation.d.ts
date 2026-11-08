// Generated declarations from the hosted animation controller.
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
    scrollTrigger: {
        start: string;
        end: string;
        scrub: boolean;
    };
}
export declare function parseAnimationConfig(raw: string): HydratedAnimationConfig | undefined;
/** Read the element's resting values before GSAP changes its inline styles. */
export declare function animationEndpoints(config: HydratedAnimationConfig, read: (key: string) => unknown): {
    from: Properties;
    to: Properties;
};
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
/** Overlapping client-route hosts share ownership until the last effect unmounts. */
export declare function acquireAnimationHydration(options: HydrationOptions): () => void;
/** Own only the contexts created here; unrelated widgets retain their GSAP state. */
export declare function installAnimationHydration({ root, engine, scroller, media, createObserver, reportError }: HydrationOptions): () => void;
export {};

export type BackyAnimationStateProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
export type BackyAnimationState = Partial<Record<BackyAnimationStateProperty, number>>;
export interface BackyAnimationSequenceStep {
    id: string;
    label: string;
    at: number;
    duration: number;
    easing?: string;
    from?: BackyAnimationState;
    to: BackyAnimationState;
}
export interface BackyAnimationSequence {
    version: 1;
    steps: BackyAnimationSequenceStep[];
}
