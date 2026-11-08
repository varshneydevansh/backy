import assert from 'node:assert/strict';
import { normalizeBackyAnimationSequence, normalizeBackyContentElement, canvasElementsToBackyContentDocument, canvasContentPayloadToBackyContentDocument, backyAnimationSequenceFinalState } from '../dist/index.mjs';
const sequence = { version: 1, steps: [
 { id: 'first', label: 'Fade and move', at: 0, duration: 1, easing: 'linear', from: { opacity: 0, x: 0 }, to: { opacity: 1, x: 90 } },
 { id: 'overlap', label: 'Rotate', at: 0.5, duration: 2, to: { rotation: 45 } },
 { id: 'last', label: 'Settle', at: 2, duration: 0.5, to: { x: 12, scale: 0.8 } },
] };
assert.deepEqual(normalizeBackyAnimationSequence(sequence), sequence);
const animation = { type: 'custom', trigger: 'scroll', duration: 0.6, delay: 0, easing: 'linear', sequence, scrollTrigger: { start: 'top 80%', scrub: true } };
const element = { id: 'motion', type: 'button', props: { label: 'Authored motion' }, animation, children: [] };
assert.deepEqual(normalizeBackyContentElement(element).animation, animation);
const document = canvasElementsToBackyContentDocument({ id: 'sequence-page', kind: 'page', elements: [element], canvasSize: { width: 900, height: 1200 } });
assert.deepEqual(document.elements[0].animation.sequence, sequence);
const reopened = canvasContentPayloadToBackyContentDocument({ id: 'sequence-page', kind: 'page', rawContent: JSON.parse(JSON.stringify({ contentDocument: document, elements: [element] })) });
assert.deepEqual(reopened.elements[0].animation, animation);
assert.deepEqual(backyAnimationSequenceFinalState(sequence), { opacity: 1, x: 12, rotation: 45, scale: 0.8 });
const legacy = { type: 'slideIn', trigger: 'hover', duration: 0.3, direction: 'left', from: { x: 0 }, to: { x: 40 } };
assert.deepEqual(normalizeBackyContentElement({ ...element, animation: legacy }).animation, legacy);
for (const invalid of [{ ...sequence, version: 0 }, { ...sequence, steps: [sequence.steps[0], sequence.steps[0]] }, { ...sequence, steps: [{ ...sequence.steps[0], to: { css: { opacity: 0 } } }] }, { ...sequence, steps: [{ ...sequence.steps[0], from: { scrollTrigger: 'unsafe' } }] }]) {
 assert.equal(normalizeBackyAnimationSequence(invalid), undefined);
 assert.equal(normalizeBackyContentElement({ ...element, animation: { ...animation, sequence: invalid } }).animation, undefined);
}
console.log('Animation sequence core PASS: typed bounds, canonical Canvas/document save+reopen, numeric states, chronology final state, malformed whole refusal and legacy compatibility.');
