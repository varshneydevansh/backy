'use client';

import React, { useState } from 'react';
import { handleBackyFigureControlKeyDown } from './inputEvents';
import { interactiveComponentFields, interactiveComponentValue, interactiveRecord, patchInteractiveComponentValue, usableInteractiveRegistryEntries } from './interactiveComponent';
import type { BackyInteractiveComponentNode, BackyInteractiveComponentRenderer, BackyInteractiveRegistryEntry, InteractiveRecord } from './interactiveComponent';

const fieldClass = 'mt-1 block min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600';
const buttonClass = 'min-h-11 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600';
const optionValueForSelection = (options: unknown[], selected: string) => { const option = options.find((candidate) => String(interactiveRecord(candidate).value ?? candidate) === selected); return interactiveRecord(option).value ?? option ?? selected; };
const json = (value: unknown) => { try { return JSON.stringify(value ?? {}, null, 2); } catch { return ''; } };

export function InteractiveComponentChooser({ entries, loading, error, onSelect, onCancel, onReload }: {
  entries: BackyInteractiveRegistryEntry[]; loading?: boolean; error?: string; onSelect: (entry: BackyInteractiveRegistryEntry) => void; onCancel: () => void; onReload?: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const choices = usableInteractiveRegistryEntries(entries);
  const matching = choices.filter((entry) => `${entry.displayName || ''} ${entry.componentKey} ${entry.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section aria-label="Choose article component" className="min-w-0 border-t border-slate-200 bg-slate-50 p-3" onKeyDown={(event) => { handleBackyFigureControlKeyDown(event); if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }} onMouseDown={(event) => event.stopPropagation()}>
    <div className="mb-2 flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">Animated diagrams and components</h3><p className="mt-1 text-xs text-slate-500">Choose a component registered for this site.</p></div><button type="button" className={buttonClass} onClick={onCancel}>Cancel</button></div>
    <label className="block text-xs font-medium text-slate-600">Find a component<input autoFocus type="search" aria-label="Find article component" value={query} onChange={(event) => setQuery(event.target.value)} className={fieldClass} /></label>
    {!loading && !error && choices.some((entry) => entry.runtimeAvailable === false) && <p role="status" className="mt-3 text-xs text-slate-600">Custom execution is disabled for this site. Those components can be inserted with their saved fallback.</p>}
    {loading ? <div role="status" className="mt-3 min-h-24 border-t border-slate-200 py-4 text-sm text-slate-500">Loading site components…</div> : error ? <div role="alert" className="mt-3 text-sm text-red-700">{error}{onReload && <button type="button" onClick={onReload} className={`${buttonClass} ml-2 border border-slate-300 bg-white text-slate-700`}>Retry components</button>}</div> : <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-slate-200 border-y border-slate-200">
      {matching.map((entry) => <button type="button" key={`${entry.type}:${entry.componentKey}:${entry.version}`} onClick={() => onSelect(entry)} className="flex min-h-16 w-full min-w-0 items-center justify-between gap-3 px-2 py-3 text-left hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"><span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{entry.displayName || entry.componentKey}</span><span className="mt-1 block break-words text-xs text-slate-500">{entry.description || entry.componentKey}</span></span><span className="shrink-0 text-right text-xs text-slate-500"><span className="block font-mono">{entry.version}</span><span className="mt-1 block">{entry.renderMode === 'sandbox-iframe' && entry.type === 'codeComponent' ? entry.runtimeAvailable === false ? 'Runtime disabled' : 'Sandbox' : entry.renderMode === 'trusted-component' && ['backy.figure.rounds', 'backy.chart.line', 'backy.chart.bar', 'backy.table.data'].includes(entry.componentKey) ? 'Native' : 'Static fallback'}</span></span></button>)}
      {!matching.length && <p role="status" className="py-4 text-sm text-slate-500">{choices.length ? 'No components match your search.' : 'No active components are registered for this site.'}</p>}
    </div>}
  </section>;
}

function JsonProperty({ label, value, onApply }: { label: string; value: unknown; onApply: (value: unknown) => void }) {
  const serialized = json(value);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState('');
  // Remount on saved value changes, while retaining an uncommitted draft during typing.
  return <div className="min-w-0"><label className="block text-xs font-medium text-slate-600">{label}<textarea aria-label={label} rows={5} value={draft} onChange={(event) => { setDraft(event.target.value); setError(''); }} className={`${fieldClass} font-mono`} /></label><button type="button" onClick={() => { try { onApply(JSON.parse(draft)); setError(''); } catch { setError('Enter valid JSON in the shape required by this property.'); } }} className={`${buttonClass} mt-2 border border-slate-300 bg-white text-slate-700`}>Apply {label.toLowerCase()}</button>{error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}</div>;
}

export function InteractiveComponentBlock({ node, readOnly = false, onChange, renderComponent }: {
  node: BackyInteractiveComponentNode; readOnly?: boolean; onChange?: (patch: InteractiveRecord) => void; renderComponent?: BackyInteractiveComponentRenderer;
}) {
  const fields = interactiveComponentFields(node);
  const title = typeof node.fallback?.title === 'string' ? node.fallback.title : node.componentKey || 'Interactive component';
  const update = (field: InteractiveRecord, value: unknown) => onChange?.(patchInteractiveComponentValue(node, String(field.key), value));
  return <figure className="my-5 min-w-0 max-w-full rounded-md border border-slate-200 bg-white text-slate-700" onKeyDown={handleBackyFigureControlKeyDown} data-backy-rich-interactive-component={node.componentKey}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><figcaption className="min-w-0 break-words text-sm font-semibold text-slate-900">{title}</figcaption>{!readOnly && <span className="break-all font-mono text-xs text-slate-500">{node.componentKey} · {node.version}</span>}</div>
    <div className="min-w-0 p-4">{renderComponent ? renderComponent(node, { readOnly }) : <p role="status">{typeof node.fallback?.text === 'string' && node.fallback.text || 'The component preview is unavailable in this editor.'}</p>}</div>
    {!readOnly && onChange && <details data-backy-authoring-controls="true" className="border-t border-slate-200 px-4 pb-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Component settings</summary><div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const key = String(field.key), label = String(field.label || field.title || key), value = interactiveComponentValue(node, field);
        const options = Array.isArray(field.options) ? field.options : Array.isArray(field.enum) ? field.enum : null;
        if (field.type === 'object' || field.type === 'array' || field.type === 'json') return <JsonProperty key={`${key}:${json(value)}`} label={label} value={value} onApply={(next) => { if (field.type === 'object' && (!next || typeof next !== 'object' || Array.isArray(next)) || field.type === 'array' && !Array.isArray(next)) throw new Error('Invalid property'); update(field, next); }} />;
        if (field.type === 'boolean' || field.type === 'checkbox' || field.type === 'toggle') return <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input aria-label={label} type="checkbox" checked={value === true} onChange={(event) => update(field, event.target.checked)} />{label}</label>;
        return <label key={key} className="block min-w-0 text-xs font-medium text-slate-600">{label}{field.required ? ' (required)' : ''}{options ? <select aria-label={label} value={String(value)} onChange={(event) => update(field, optionValueForSelection(options, event.target.value))} className={fieldClass}>{options.map((option, index) => { const definition = interactiveRecord(option); const optionValue = definition.value ?? option; return <option key={index} value={String(optionValue)}>{String(definition.label ?? optionValue)}</option>; })}{!options.some((option) => String(interactiveRecord(option).value ?? option) === String(value)) && <option value={String(value)}>{String(value) || 'Choose a value'}</option>}</select> : <input aria-label={label} type={['number', 'integer', 'range'].includes(String(field.type)) ? 'number' : 'text'} value={typeof value === 'string' || typeof value === 'number' ? value : ''} min={typeof (field.min ?? field.minimum) === 'number' ? Number(field.min ?? field.minimum) : undefined} max={typeof (field.max ?? field.maximum) === 'number' ? Number(field.max ?? field.maximum) : undefined} step={typeof field.step === 'number' ? field.step : field.type === 'integer' ? 1 : 'any'} onChange={(event) => { const numeric = ['number', 'integer', 'range'].includes(String(field.type)); const next = numeric ? event.target.value === '' ? '' : Number(event.target.value) : event.target.value; if (!numeric || next === '' || typeof next === 'number' && Number.isFinite(next)) update(field, next); }} className={fieldClass} />}</label>;
      })}
      <label className="block text-xs font-medium text-slate-600">Caption<input aria-label="Component caption" value={title} onChange={(event) => onChange({ fallback: { ...interactiveRecord(node.fallback), title: event.target.value } })} className={fieldClass} /></label>
      <label className="block text-xs font-medium text-slate-600">Fallback description<textarea aria-label="Component fallback description" value={typeof node.fallback?.text === 'string' ? node.fallback.text : ''} onChange={(event) => onChange({ fallback: { ...interactiveRecord(node.fallback), text: event.target.value } })} className={fieldClass} /></label>
    </div><details className="mt-3 border-t border-slate-200"><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">Advanced configuration</summary><div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><JsonProperty key={`props:${json(node.props)}`} label="Properties" value={node.props} onApply={(next) => { if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Properties must be an object'); onChange({ props: { ...interactiveRecord(node.props), ...interactiveRecord(next) } }); }} /><JsonProperty key={`bindings:${json(node.dataBindings)}`} label="Data bindings" value={node.dataBindings ?? {}} onApply={(next) => { if (!next || typeof next !== 'object') throw new Error('Bindings must be an object or array'); onChange({ dataBindings: next }); }} /></div></details></details>}
  </figure>;
}
