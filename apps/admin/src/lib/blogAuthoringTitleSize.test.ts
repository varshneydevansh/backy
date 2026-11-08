import assert from 'node:assert/strict';
import { watchBlogTitleSize } from './blogAuthoringTitleSize';

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let resized: ResizeObserverCallback = () => {};
let disconnected = false;
const originalObserver = globalThis.ResizeObserver;
globalThis.ResizeObserver = class {
  constructor(callback: ResizeObserverCallback) { resized = callback; }
  observe() {}
  unobserve() {}
  disconnect() { disconnected = true; }
} as unknown as typeof ResizeObserver;

let width = 760;
let naturalHeight = 88;
let visible = true;
let resolveFonts!: () => void;
const fontEvents = new Set<() => void>();
const style = { height: '' };
const input = {
  style,
  ownerDocument: {
    defaultView: {
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame: (frame: number) => frames.delete(frame),
    },
    fonts: {
      ready: new Promise<void>((resolve) => { resolveFonts = resolve; }),
      addEventListener: (_name: string, callback: () => void) => fontEvents.add(callback),
      removeEventListener: (_name: string, callback: () => void) => fontEvents.delete(callback),
    },
  },
  getClientRects: () => visible ? [{}] : [],
  getBoundingClientRect: () => ({ width }),
  get scrollHeight() { return style.height === 'auto' ? naturalHeight : Math.max(parseFloat(style.height) || 0, naturalHeight); },
} as unknown as HTMLTextAreaElement;
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(0)); };
const resize = () => resized([], {} as ResizeObserver);

try {
  const stop = watchBlogTitleSize(input);
  flush();
  assert.equal(style.height, '88px');
  resize();
  assert.equal(frames.size, 0, 'our own height change cannot create a resize measurement loop');
  width = 320;
  naturalHeight = 220;
  resize(); resize(); resize();
  assert.equal(frames.size, 1, 'rapid panel/viewport resize batches into one animation frame');
  flush();
  assert.equal(style.height, '220px', 'unchanged title grows when the available width shrinks');
  width = 760;
  naturalHeight = 88;
  resize(); flush();
  assert.equal(style.height, '88px', 'title can shrink again when the panel becomes wider');
  naturalHeight = 106;
  fontEvents.forEach((callback) => callback()); flush();
  assert.equal(style.height, '106px', 'font loading remeasures at unchanged width');
  visible = false;
  fontEvents.forEach((callback) => callback()); flush();
  assert.equal(style.height, '106px', 'hidden Write surface never records a zero height');
  stop();
  resolveFonts();
  await Promise.resolve();
  assert.equal(frames.size, 0, 'late font readiness cannot schedule work after cleanup');
  assert.equal(fontEvents.size, 0);
  assert(disconnected);
  console.log('Blog title autosize behavior checks passed.');
} finally {
  globalThis.ResizeObserver = originalObserver;
}
