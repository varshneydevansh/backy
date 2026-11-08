import { useId, useState } from 'react';
import { BACKY_ANIMATION_SEQUENCE_MAX_STEPS, normalizeBackyAnimationSequence, type BackyAnimationSequence, type BackyAnimationSequenceStep, type BackyAnimationStateProperty } from '@backy-cms/core';

const properties: BackyAnimationStateProperty[] = ['opacity', 'x', 'y', 'scale', 'rotation'];
const easings = ['power2.out', 'power1.inOut', 'back.out(1.7)', 'bounce.out', 'linear'];
const inputStyle = { width: '100%', minWidth: 0, padding: '6px 8px', minHeight: '32px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' };
const buttonStyle = { minHeight: '32px', minWidth: '32px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '5px', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', lineHeight: '18px' };
const newId = () => `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function AnimationSequenceEditor({ value, onChange }: { value: BackyAnimationSequence; onChange: (value: BackyAnimationSequence) => void }) {
    const id = useId();
    const [error, setError] = useState('');
    const duration = Math.max(0.1, ...value.steps.map(step => step.at + step.duration));
    const commit = (steps: BackyAnimationSequenceStep[]) => {
        const next = normalizeBackyAnimationSequence({ version: 1, steps });
        if (next) { setError(''); onChange(next); }
        else setError('That change was not applied. Use finite values within the field limits and keep at least one To value per step.');
    };
    const update = (index: number, input: Partial<BackyAnimationSequenceStep>) => commit(value.steps.map((step, i) => i === index ? { ...step, ...input } : step));
    const move = (index: number, offset: number) => {
        const steps = [...value.steps];
        [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]];
        commit(steps);
    };
    const setState = (index: number, endpoint: 'from' | 'to', key: BackyAnimationStateProperty, text: string) => {
        const next = { ...value.steps[index][endpoint] };
        if (!text.trim()) delete next[key]; else next[key] = Number(text);
        update(index, { [endpoint]: endpoint === 'from' && !Object.keys(next).length ? undefined : next });
    };
    return <section aria-labelledby={`${id}-heading`} data-testid="editor-animation-sequence">
        <h4 id={`${id}-heading`} style={{ margin: '12px 0 6px', fontSize: '13px' }}>Layer timeline</h4>
        <p style={{ fontSize: '11px', color: '#6b7280' }}>Steps animate this layer. Start times can overlap. Ordering resolves equal start times; moving a row keeps its start time. Blank From values continue the prior state. From values animate only when a matching To value is present.</p>
        <div role="img" aria-label={`Timeline spans ${duration.toFixed(1)} seconds with ${value.steps.length} ${value.steps.length === 1 ? 'step' : 'steps'}`} style={{ padding: '6px', background: '#f3f4f6', borderRadius: '4px' }}>
            {value.steps.map((step, index) => <div key={step.id} style={{ position: 'relative', height: '20px', marginBottom: '3px', fontSize: '10px' }}><span style={{ position: 'absolute', left: `${step.at / duration * 100}%`, width: `${Math.max(1, step.duration / duration * 100)}%`, maxWidth: `${100 - step.at / duration * 100}%`, background: '#dbeafe', height: '100%', borderRadius: '3px' }} /><span style={{ position: 'relative' }}>{index + 1}. {step.label} · {step.at.toFixed(1)}–{(step.at + step.duration).toFixed(1)}s</span></div>)}
        </div>
        {error ? <p role="alert" style={{ color: '#b91c1c', fontSize: '11px' }}>{error}</p> : null}
        <ol style={{ padding: 0, listStyle: 'none' }}>
            {value.steps.map((step, index) => <li key={step.id} style={{ margin: '10px 0', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '5px' }}>
                <label style={{ fontSize: '11px' }}>Step {index + 1} name<input aria-label={`Step ${index + 1} name`} style={inputStyle} maxLength={100} value={step.label} onChange={event => update(index, { label: event.target.value })} /></label>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <label style={{ flex: 1, minWidth: 0, fontSize: '11px' }}>Start (s)<input aria-label={`Step ${index + 1} start seconds`} style={inputStyle} type="number" min={0} max={180 - step.duration} step={0.1} value={step.at} onChange={event => update(index, { at: Number(event.target.value) })} /></label>
                    <label style={{ flex: 1, minWidth: 0, fontSize: '11px' }}>Duration (s)<input aria-label={`Step ${index + 1} duration seconds`} style={inputStyle} type="number" min={0} max={Math.min(60, 180 - step.at)} step={0.1} value={step.duration} onChange={event => update(index, { duration: Number(event.target.value) })} /></label>
                </div>
                <label style={{ fontSize: '11px' }}>Easing<select aria-label={`Step ${index + 1} easing`} style={inputStyle} value={step.easing || 'power2.out'} onChange={event => update(index, { easing: event.target.value })}>{[...new Set([...easings, ...(step.easing ? [step.easing] : [])])].map(ease => <option key={ease}>{ease}</option>)}</select></label>
                <table style={{ width: '100%', fontSize: '11px', tableLayout: 'fixed', marginTop: '6px' }}><caption style={{ textAlign: 'left' }}>Numeric layer states</caption><thead><tr><th scope="col">Property</th><th scope="col">From</th><th scope="col">To</th></tr></thead><tbody>{properties.map(key => <tr key={key}><th scope="row" style={{ fontWeight: 400 }}>{key}</th>{(['from', 'to'] as const).map(endpoint => <td key={endpoint}><input aria-label={`Step ${index + 1} ${endpoint} ${key}`} style={inputStyle} type="number" step={0.1} min={key === 'opacity' || key.startsWith('scale') ? 0 : -100000} max={key === 'opacity' ? 1 : key.startsWith('scale') ? 100 : 100000} value={step[endpoint]?.[key] ?? ''} onChange={event => setState(index, endpoint, key, event.target.value)} /></td>)}</tr>)}</tbody></table>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                    <button type="button" style={buttonStyle} aria-label={`Move step ${index + 1} earlier in ordering`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                    <button type="button" style={buttonStyle} aria-label={`Move step ${index + 1} later in ordering`} disabled={index === value.steps.length - 1} onClick={() => move(index, 1)}>↓</button>
                    <button type="button" style={buttonStyle} aria-label={`Duplicate step ${index + 1}`} disabled={value.steps.length >= BACKY_ANIMATION_SEQUENCE_MAX_STEPS} onClick={() => commit([...value.steps.slice(0, index + 1), { ...step, id: newId(), label: `${step.label.slice(0, 90)} copy` }, ...value.steps.slice(index + 1)])}>Duplicate</button>
                    <button type="button" style={buttonStyle} aria-label={`Remove step ${index + 1}`} disabled={value.steps.length === 1} onClick={() => commit(value.steps.filter((_, i) => i !== index))}>Remove</button>
                </div>
            </li>)}
        </ol>
        <button type="button" style={buttonStyle} data-testid="editor-animation-add-step" disabled={value.steps.length >= BACKY_ANIMATION_SEQUENCE_MAX_STEPS || duration >= 180} onClick={() => commit([...value.steps, { id: newId(), label: `Step ${value.steps.length + 1}`, at: duration, duration: Math.min(0.6, 180 - duration), easing: 'power2.out', to: { x: 0 } }])}>Add step</button>
        <p aria-live="polite" style={{ fontSize: '11px', color: '#6b7280' }}>{value.steps.length} of {BACKY_ANIMATION_SEQUENCE_MAX_STEPS} steps. Timeline limit: 180 seconds. At least one To value is required per step.</p>
    </section>;
}
