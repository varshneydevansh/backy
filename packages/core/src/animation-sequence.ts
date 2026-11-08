/** Bounded data-only, same-layer motion. No selectors, callbacks or plugin payloads. */
export const BACKY_ANIMATION_SEQUENCE_MAX_STEPS = 24;
export const BACKY_ANIMATION_SEQUENCE_MAX_SECONDS = 180;
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
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const state = (value: unknown): BackyAnimationState | undefined => {
  if (!record(value)) return undefined;
  const result: BackyAnimationState = {};
  for (const [key, item] of Object.entries(value)) {
    if (!['x', 'y', 'scale', 'rotation', 'opacity'].includes(key) || typeof item !== 'number' || !Number.isFinite(item)) return undefined;
    if (key === 'opacity' ? item < 0 || item > 1 : key.startsWith('scale') ? item < 0 || item > 100 : Math.abs(item) > 100000) return undefined;
    result[key as BackyAnimationStateProperty] = item;
  }
  return result;
};
/** Invalid/oversized sequences are refused as a whole; never silently run a subset. */
export function normalizeBackyAnimationSequence(value: unknown): BackyAnimationSequence | undefined {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > BACKY_ANIMATION_SEQUENCE_MAX_STEPS) return undefined;
  const ids = new Set<string>(), steps: BackyAnimationSequenceStep[] = [];
  for (const raw of value.steps) {
    if (!record(raw) || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 100 || ids.has(raw.id) || typeof raw.label !== 'string' || raw.label.length > 100) return undefined;
    if (typeof raw.at !== 'number' || !Number.isFinite(raw.at) || raw.at < 0 || typeof raw.duration !== 'number' || !Number.isFinite(raw.duration) || raw.duration < 0 || raw.duration > 60 || raw.at + raw.duration > BACKY_ANIMATION_SEQUENCE_MAX_SECONDS) return undefined;
    if (raw.easing !== undefined && (typeof raw.easing !== 'string' || raw.easing.length > 100)) return undefined;
    const to = state(raw.to), from = raw.from === undefined ? undefined : state(raw.from);
    if (!to || !Object.keys(to).length || (raw.from !== undefined && !from)) return undefined;
    ids.add(raw.id);
    steps.push({ id: raw.id, label: raw.label, at: raw.at, duration: raw.duration, ...(raw.easing ? { easing: raw.easing } : {}), ...(from ? { from } : {}), to });
  }
  return { version: 1, steps };
}
/** Resting value for reduced motion follows the latest finishing step per property. */
export function backyAnimationSequenceFinalState(sequence: BackyAnimationSequence): BackyAnimationState {
  return [...sequence.steps].sort((a, b) => (a.at + a.duration) - (b.at + b.duration)).reduce<BackyAnimationState>((result, step) => ({ ...result, ...step.to }), {});
}
