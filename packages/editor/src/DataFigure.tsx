'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createDataFigureLoadSession, resolveDataFigureView } from './dataFigureLoading';
import type { DataFigureLoadState } from './dataFigureLoading';
import { handleBackyFigureControlKeyDown } from './inputEvents';
import {
  buildBackyDataChart, formatBackyDataValue, getBackyDataFields, getBackyDataValue,
  inspectBackyDataRecords, isBackyDataFigureKey, queryBackyDataTable, resolveBackyDataColumns, getBackyDataFigureRequestedFields,
} from '@backy-cms/core';
import type { BackyDataFigureConfig, BackyDataFigureCollection, BackyDataFigureKey, BackyDataFigureLoader } from '@backy-cms/core';
export type { BackyDataFigureConfig, BackyDataFigureCollection, BackyDataFigureKey, BackyDataFigureLoader } from '@backy-cms/core';

export interface DataFigureProps {
  config: BackyDataFigureConfig;
  editable?: boolean;
  onChange?: (patch: Partial<BackyDataFigureConfig>) => void;
  loadRecords?: BackyDataFigureLoader;
  collections?: BackyDataFigureCollection[];
  pageSize?: number;
  className?: string;
}
const inputStyle: React.CSSProperties = { minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', font: 'inherit', color: '#334155', background: '#fff', boxSizing: 'border-box', maxWidth: '100%' };
const buttonStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
const COLORS = ['#0f766e', '#2563eb', '#b45309', '#7c3aed', '#be123c', '#475569'];
const kindName = (key: BackyDataFigureKey) => key === 'backy.table.data' ? 'Table' : key === 'backy.chart.bar' ? 'Bar chart' : 'Line chart';
const jsonDraft = (value: unknown): string => { try { return JSON.stringify(value ?? [], null, 2); } catch { return ''; } };
const ownSource = (config: BackyDataFigureConfig) => config.source && typeof config.source === 'object' ? config.source : { type: 'inline' as const };

/** The initial width is identical during SSR and hydration; measurement follows mount. */
export function resolveBackyDataPlotLayout(measuredWidth = 720, labelCount = 0, isBar = false) {
  const width = Number.isFinite(measuredWidth) && measuredWidth > 0 ? Math.max(240, Math.min(4096, Math.round(measuredWidth))) : 720;
  const left = 72, top = 20, plottingHeight = 224, height = 304;
  const plottingWidth = width - left - 28;
  const tickCount = Math.min(labelCount, Math.max(2, Math.min(7, Math.floor(plottingWidth / 80) + 1)));
  const tickIndices = Array.from({ length: tickCount }, (_, index) => tickCount === 1 ? 0 : Math.round(index * (labelCount - 1) / (tickCount - 1)));
  const labelSpan = plottingWidth * (isBar && labelCount > 1 ? (labelCount - 1) / labelCount : 1);
  const labelCharacters = Math.max(4, Math.min(16, Math.floor(labelSpan / Math.max(1, tickCount) / 7)));
  return { width, height, left, top, plottingWidth, plottingHeight, tickIndices, labelCharacters, fontSize: 12 };
}

/** Match local content pixels so SVG text adds no extra scaling inside a canvas. */
export function watchBackyDataPlotWidth(element: SVGSVGElement, onWidth: (width: number) => void): () => void {
  let active = true;
  const publishWidth = (width: number) => {
    if (!active) return;
    if (Number.isFinite(width) && width > 0) onWidth(resolveBackyDataPlotLayout(width).width);
  };
  const measure = () => publishWidth(element.clientWidth);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => publishWidth(entries[0]?.contentRect.width ?? element.clientWidth));
  observer?.observe(element);
  if (typeof window !== 'undefined') window.addEventListener('resize', measure);
  measure();
  return () => {
    active = false;
    observer?.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
  };
}

export function DataFigure({ config, editable = false, onChange, loadRecords, collections = [], pageSize = 10, className }: DataFigureProps): React.ReactElement {
  const invalidConfig = !config || typeof config !== 'object' || Array.isArray(config) || !isBackyDataFigureKey(config.componentKey);
  config = config && typeof config === 'object' && !Array.isArray(config) ? config : { componentKey: 'backy.chart.line' };
  const id = useId();
  const source = ownSource(config);
  const collectionId = source.type === 'collection' && typeof source.collectionId === 'string' ? source.collectionId : '';
  const collectionSource = source.type === 'collection';
  const requestedFields = collectionSource ? getBackyDataFigureRequestedFields(config) : null;
  const requestedFieldKey = editable ? 'authoring-fields' : JSON.stringify(requestedFields);
  const hydrated = config.dataStatus === 'ready' && Array.isArray(config.records);
  const identity = useMemo(() => ({}), [collectionSource, collectionId, loadRecords, editable, config.records, config.dataStatus, config.dataError, requestedFieldKey]);
  const [reload, setReload] = useState<{ identity: object; epoch: number } | null>(null);
  const epoch = reload?.identity === identity ? reload.epoch : 0;
  const [loaded, setLoaded] = useState<DataFigureLoadState | null>(null);
  const session = useMemo(createDataFigureLoadSession, []);
  const reloadData = () => { session.cancel(); setReload({ identity, epoch: epoch + 1 }); };
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: '', direction: 'asc' });
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const [hovered, setHovered] = useState<{ series: string; label: string; value: number } | null>(null);
  const [recordsDraft, setRecordsDraft] = useState(() => jsonDraft(config.records));
  const [draftError, setDraftError] = useState('');
  const serializedRecords = jsonDraft(config.records);
  useEffect(() => { setRecordsDraft(serializedRecords); setDraftError(''); }, [serializedRecords]);
  useEffect(() => { setPage(0); setQuery(''); setSort({ key: '', direction: 'asc' }); setHiddenSeries([]); setHovered(null); }, [collectionId, config.componentKey]);
  useEffect(() => {
    if (!collectionSource || !collectionId || !loadRecords || (!editable && !requestedFields) || (!editable && epoch === 0 && (hydrated || config.dataStatus === 'error'))) return;
    void session.start(identity, epoch, collectionId, loadRecords, setLoaded, editable ? undefined : requestedFields!);
    return session.cancel;
  }, [collectionSource, collectionId, loadRecords, identity, epoch, hydrated, editable, config.dataStatus, session]);
  const view = resolveDataFigureView(config, editable, loadRecords, identity, epoch, loaded);
  const status = invalidConfig ? 'error' : view.status;
  const sourceError = invalidConfig ? 'Choose a valid figure display in the figure settings.' : view.error;
  const records = view.records;
  const inspection = useMemo(() => inspectBackyDataRecords(records), [records]);
  const rows = inspection.rows;
  const fields = useMemo(() => getBackyDataFields(rows), [rows]);
  const columns = useMemo(() => resolveBackyDataColumns(config, rows), [config, rows]);
  const result = useMemo(() => queryBackyDataTable(rows, columns, { query, page, pageSize, sortKey: sort.key, sortDirection: sort.direction }), [rows, columns, query, page, pageSize, sort]);
  const chart = useMemo(() => buildBackyDataChart(rows, config), [rows, config]);
  const plotRef = useRef<SVGSVGElement>(null);
  const [plotWidth, setPlotWidth] = useState(720);
  useEffect(() => {
    const element = plotRef.current;
    if (element) return watchBackyDataPlotWidth(element, setPlotWidth);
  }, [status, config.componentKey, chart.hasValues]);
  const visibleSeries = chart.series.filter((series) => !hiddenSeries.includes(series.key));
  const kind = isBackyDataFigureKey(config.componentKey) ? config.componentKey : 'backy.chart.line';
  const missingFields = (kind === 'backy.table.data' ? columns.map((column) => column.key) : [chart.xField, ...chart.series.map((series) => series.key)]).filter((field) => field && !fields.includes(field));
  const missingLabels = kind === 'backy.table.data' ? 0 : rows.filter((row) => !formatBackyDataValue(getBackyDataValue(row, chart.xField))).length;
  const canEdit = editable && Boolean(onChange);
  const title = typeof config.title === 'string' && config.title.trim() ? config.title : kindName(kind);
  const patch = (value: Partial<BackyDataFigureConfig>) => onChange?.(value);
  const applyRecords = () => {
    try {
      const parsed = JSON.parse(recordsDraft);
      const inspected = inspectBackyDataRecords(parsed);
      if (inspected.error || inspected.invalidRows) { setDraftError('Use an array of row objects. Each row must contain named fields.'); return; }
      patch({ records: parsed }); setDraftError(''); setPage(0);
    } catch { setDraftError('The data is not valid JSON. Check commas, quotes and brackets.'); }
  };
  const plot = resolveBackyDataPlotLayout(plotWidth, chart.labels.length, kind === 'backy.chart.bar');
  const { plottingWidth, plottingHeight, left, top } = plot;
  const truncateLabel = (label: string, characters: number) => label.length > characters ? `${label.slice(0, characters - 1)}…` : label;
  const x = (index: number) => left + (kind === 'backy.chart.bar' ? (index + 0.5) * plottingWidth / Math.max(1, chart.labels.length) : chart.labels.length <= 1 ? plottingWidth / 2 : index * plottingWidth / (chart.labels.length - 1));
  const domainScale = Math.max(Math.abs(chart.minimum), Math.abs(chart.maximum), 1);
  const y = (value: number) => top + plottingHeight - (value / domainScale - chart.minimum / domainScale) / (chart.maximum / domainScale - chart.minimum / domainScale) * plottingHeight;
  const showValue = (series: string, index: number, value: number) => setHovered({ series, label: chart.labels[index], value });
  return <figure onKeyDown={handleBackyFigureControlKeyDown} aria-busy={status === 'loading'} className={className} data-backy-data-figure={kind} style={{ margin: '1.25em 0', minWidth: 0, maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#fff', color: '#334155', fontSize: 14, lineHeight: 1.5 }}>
    <figcaption id={`${id}-title`} style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>{title}</figcaption>
    {collectionSource && collectionId && loadRecords && (editable || requestedFields) && !invalidConfig && <button type="button" disabled={status === 'loading'} onClick={reloadData} style={{ ...buttonStyle, marginBottom: 12 }}>{status === 'error' ? 'Retry data' : status === 'loading' ? 'Loading data…' : 'Refresh data'}</button>}
    {status === 'loading' && <p role="status">Loading data…</p>}
    {status === 'error' && <p role="alert">{sourceError}</p>}
    {status === 'ready' && inspection.error && <p role="alert">{inspection.error}</p>}
    {status === 'ready' && inspection.invalidRows > 0 && <p role="status">{inspection.invalidRows} invalid {inspection.invalidRows === 1 ? 'row is' : 'rows are'} excluded from this view. Saved data is unchanged.</p>}
    {status === 'ready' && rows.length > 0 && missingFields.length > 0 && <p role="status">Selected fields are missing from this data: {Array.from(new Set(missingFields)).join(', ')}.</p>}
    {status === 'ready' && chart.xField && missingLabels > 0 && <p role="status">{missingLabels} missing horizontal {missingLabels === 1 ? 'label is' : 'labels are'} shown as row numbers.</p>}
    {status === 'ready' && !inspection.error && !rows.length && <p role="status">No data yet. {canEdit ? 'Add your rows in the figure settings.' : ''}</p>}
    {status === 'ready' && rows.length > 0 && kind === 'backy.table.data' && !columns.length && <p role="status">Choose columns in the figure settings to show this table.</p>}
    {status === 'ready' && rows.length > 0 && kind === 'backy.table.data' && columns.length > 0 && <>
      <label htmlFor={`${id}-search`} style={{ display: 'block', marginBottom: 12 }}>Search table <input id={`${id}-search`} type="search" aria-label="Search table" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} style={{ ...inputStyle, marginLeft: 8, width: 'min(100%, 260px)' }} /></label>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table aria-labelledby={`${id}-title`} style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr>{columns.map((column, index) => <th key={`${column.key}-${index}`} scope="col" aria-sort={sort.key === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} style={{ borderBottom: '2px solid #cbd5e1' }}><button type="button" aria-label={`Sort by ${column.label}`} onClick={() => { setSort({ key: column.key, direction: sort.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc' }); setPage(0); }} style={{ ...buttonStyle, textAlign: 'left', fontWeight: 600, border: 0, whiteSpace: 'nowrap' }}>{column.label}{sort.key === column.key ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>)}</tr></thead>
          <tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((column, index) => <td key={`${column.key}-${index}`} style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', overflowWrap: 'anywhere', maxWidth: 280 }}>{formatBackyDataValue(getBackyDataValue(row, column.key))}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {!result.total && <p role="status">No rows match your search.</p>}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <span role="status">{result.total} {result.total === 1 ? 'row' : 'rows'} · Page {result.page + 1} of {result.pageCount}</span>
        <button type="button" disabled={result.page === 0} onClick={() => setPage(result.page - 1)} style={buttonStyle}>Previous</button>
        <button type="button" disabled={result.page + 1 >= result.pageCount} onClick={() => setPage(result.page + 1)} style={buttonStyle}>Next</button>
      </div>
    </>}
    {status === 'ready' && rows.length > 0 && kind !== 'backy.table.data' && <>
      {chart.invalidValues > 0 && <p role="status">{chart.invalidValues} missing or invalid numeric {chart.invalidValues === 1 ? 'value is' : 'values are'} shown as gaps.</p>}
      {!chart.hasValues && <p role="status">Choose numeric value fields to draw this chart.</p>}
      {chart.hasValues && <>
        <div role="group" aria-label="Chart series" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>{chart.series.map((series, index) => <button type="button" key={series.key} aria-pressed={!hiddenSeries.includes(series.key)} onClick={() => { setHiddenSeries((hidden) => hidden.includes(series.key) ? hidden.filter((key) => key !== series.key) : [...hidden, series.key]); setHovered(null); }} style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 8, opacity: hiddenSeries.includes(series.key) ? 0.5 : 1 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[index % COLORS.length] }} />{series.key}</button>)}</div>
        <svg ref={plotRef} role="img" aria-labelledby={`${id}-title ${id}-description`} viewBox={`0 0 ${plot.width} ${plot.height}`} style={{ display: 'block', width: '100%', height: 'auto', minWidth: 0 }}>
          <desc id={`${id}-description`}>{`${kindName(kind)}. Horizontal axis: ${chart.xField}. Series: ${visibleSeries.map((series) => series.key).join(', ')}. Focus a data point to read its value.`}</desc>
          {[0, 1, 2, 3, 4].map((tick) => { const value = chart.minimum * (1 - tick / 4) + chart.maximum * (tick / 4); return <g key={tick}><line x1={left} x2={left + plottingWidth} y1={y(value)} y2={y(value)} stroke="#e2e8f0" /><text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize={plot.fontSize} fill="#64748b">{Number.isFinite(Number(value.toPrecision(4))) ? Number(value.toPrecision(4)) : value.toExponential(3)}</text></g>; })}
          <line x1={left} x2={left + plottingWidth} y1={y(0)} y2={y(0)} stroke="#94a3b8" />
          {plot.tickIndices.map((index, tick) => <text key={index} x={x(index)} y={top + plottingHeight + 24} textAnchor={plot.tickIndices.length === 1 ? 'middle' : tick === 0 ? 'start' : tick === plot.tickIndices.length - 1 ? 'end' : 'middle'} fontSize={plot.fontSize} fill="#64748b" aria-label={chart.labels[index]}>{truncateLabel(chart.labels[index], plot.labelCharacters)}</text>)}
          <text x={left + plottingWidth / 2} y={294} textAnchor="middle" fontSize={plot.fontSize} fill="#64748b">{truncateLabel(chart.xField, Math.max(4, Math.floor(plottingWidth / 7)))}</text>
          {visibleSeries.map((series, seriesIndex) => {
            const color = COLORS[chart.series.findIndex((item) => item.key === series.key) % COLORS.length];
            let activePath = false;
            const path = series.values.map((value, index) => { if (value === null) { activePath = false; return ''; } const command = activePath ? 'L' : 'M'; activePath = true; return `${command}${x(index)},${y(value)}`; }).join(' ');
            const groupWidth = plottingWidth / Math.max(1, chart.labels.length);
            const barWidth = groupWidth * 0.72 / Math.max(1, visibleSeries.length);
            return <g key={series.key}>
              {kind === 'backy.chart.line' && <path d={path} fill="none" stroke={color} strokeWidth="2" />}
              {series.values.map((value, index) => value === null ? null : kind === 'backy.chart.line'
                ? <circle key={index} cx={x(index)} cy={y(value)} r={hovered?.series === series.key && hovered.label === chart.labels[index] ? 5 : 3} fill={color} tabIndex={0} aria-label={`${series.key}, ${chart.labels[index]}: ${value}`} onMouseEnter={() => showValue(series.key, index, value)} onMouseLeave={() => setHovered(null)} onFocus={() => showValue(series.key, index, value)} onBlur={() => setHovered(null)}><title>{`${series.key}: ${chart.labels[index]} · ${value}`}</title></circle>
                : <rect key={index} x={left + index * groupWidth + groupWidth * 0.14 + seriesIndex * barWidth} y={Math.min(y(value), y(0))} width={Math.max(0.5, barWidth - 2)} height={Math.max(1, Math.abs(y(value) - y(0)))} fill={color} tabIndex={0} aria-label={`${series.key}, ${chart.labels[index]}: ${value}`} onMouseEnter={() => showValue(series.key, index, value)} onMouseLeave={() => setHovered(null)} onFocus={() => showValue(series.key, index, value)} onBlur={() => setHovered(null)}><title>{`${series.key}: ${chart.labels[index]} · ${value}`}</title></rect>)}
            </g>;
          })}
        </svg>
        <output aria-live="polite" style={{ display: 'block', minHeight: 24, color: '#475569' }}>{hovered ? `${hovered.label} · ${hovered.series}: ${hovered.value}` : visibleSeries.length ? 'Hover or focus a point to read its value.' : 'Choose a series to show it.'}</output>
      </>}
    </>}
    {canEdit && <details style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 4 }}>
      <summary style={{ minHeight: 44, padding: '10px 0', cursor: 'pointer', fontWeight: 600 }}>Figure settings</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
        <label>Title<input aria-label="Figure title" value={typeof config.title === 'string' ? config.title : ''} onChange={(event) => patch({ title: event.target.value })} style={{ ...inputStyle, display: 'block', width: '100%' }} /></label>
        <label>Display<select aria-label="Figure display" value={kind} onChange={(event) => patch({ componentKey: event.target.value as BackyDataFigureKey })} style={{ ...inputStyle, display: 'block', width: '100%' }}><option value="backy.chart.line">Line chart</option><option value="backy.chart.bar">Bar chart</option><option value="backy.table.data">Table</option></select></label>
        <label>Data source<select aria-label="Figure data source" value={collectionSource ? 'collection' : 'inline'} onChange={(event) => patch({ source: event.target.value === 'inline' ? { ...source, type: 'inline' } : { ...source, type: 'collection', collectionId: collections[0]?.id || '' }, ...(event.target.value === 'collection' ? { xField: '', yFields: [], columns: [] } : {}), dataStatus: undefined, dataError: undefined })} style={{ ...inputStyle, display: 'block', width: '100%' }}><option value="inline">Article data</option>{(collections.length > 0 || collectionSource) && <option value="collection">Collection</option>}</select></label>
        {collectionSource && <label>Collection<select aria-label="Figure collection" value={collectionId} onChange={(event) => patch({ source: { ...source, type: 'collection', collectionId: event.target.value }, xField: '', yFields: [], columns: [], dataStatus: undefined, dataError: undefined })} style={{ ...inputStyle, display: 'block', width: '100%' }}><option value="">Choose a collection</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}{collectionId && !collections.some((collection) => collection.id === collectionId) && <option value={collectionId}>{collectionId}</option>}</select></label>}
        {kind !== 'backy.table.data' && <label>Horizontal field<select aria-label="Chart horizontal field" value={chart.xField} onChange={(event) => patch({ xField: event.target.value })} style={{ ...inputStyle, display: 'block', width: '100%' }}><option value="">Choose a field</option>{fields.map((field) => <option key={field} value={field}>{field}</option>)}{chart.xField && !fields.includes(chart.xField) && <option value={chart.xField}>{chart.xField} (missing)</option>}</select></label>}
      </div>
      {kind !== 'backy.table.data' && <fieldset style={{ border: 0, padding: '12px 0', margin: 0 }}><legend>Value fields</legend>{Array.from(new Set([...fields, ...chart.series.map((series) => series.key)])).filter((field) => field !== chart.xField).map((field) => <label key={field} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, marginRight: 16 }}><input type="checkbox" checked={chart.series.some((series) => series.key === field)} onChange={(event) => patch({ yFields: event.target.checked ? [...chart.series.map((series) => series.key), field] : chart.series.map((series) => series.key).filter((key) => key !== field) })} />{field}</label>)}</fieldset>}
      {kind === 'backy.table.data' && <fieldset style={{ border: 0, padding: '12px 0', margin: 0 }}><legend>Columns</legend><div>{Array.from(new Set([...fields, ...columns.map((column) => column.key)])).map((field) => <label key={field} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, marginRight: 16 }}><input type="checkbox" checked={columns.some((column) => column.key === field)} onChange={(event) => patch({ columns: event.target.checked ? [...columns, { key: field, label: field }] : columns.filter((column) => column.key !== field) })} />{field}</label>)}</div>{columns.map((column, index) => <label key={`${column.key}-${index}`} style={{ display: 'inline-block', margin: '4px 8px 4px 0' }}>{column.key}<input aria-label={`Column label for ${column.key}`} value={column.label} onChange={(event) => patch({ columns: columns.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} style={{ ...inputStyle, display: 'block', width: 180 }} /></label>)}</fieldset>}
      {!collectionSource && <div style={{ marginTop: 12 }}><label htmlFor={`${id}-rows`} style={{ display: 'block', fontWeight: 500 }}>Rows <span style={{ fontWeight: 400, color: '#64748b' }}>— edit named fields in JSON</span></label><textarea id={`${id}-rows`} aria-label="Figure rows" rows={8} value={recordsDraft} onChange={(event) => { setRecordsDraft(event.target.value); setDraftError(''); }} style={{ ...inputStyle, width: '100%', display: 'block', fontFamily: 'monospace', fontSize: 13, resize: 'vertical', marginTop: 6 }} /><button type="button" onClick={applyRecords} style={{ ...buttonStyle, marginTop: 8, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>Apply rows</button>{draftError && <p role="alert">{draftError}</p>}</div>}
    </details>}
  </figure>;
}
export default DataFigure;
