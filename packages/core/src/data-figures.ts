export type BackyDataFigureKey = 'backy.chart.line' | 'backy.chart.bar' | 'backy.table.data';
export type BackyDataFigureSource = ({ type: 'inline' } | { type: 'collection'; collectionId: string }) & Record<string, unknown>;
export interface BackyDataFigureColumn { key: string; label: string; [key: string]: unknown }
export interface BackyDataFigureConfig {
  componentKey: BackyDataFigureKey;
  title?: string;
  records?: unknown;
  xField?: string;
  yFields?: string[];
  columns?: BackyDataFigureColumn[];
  source?: BackyDataFigureSource;
  dataStatus?: 'ready' | 'error';
  dataError?: string;
  [key: string]: unknown;
}
export interface BackyDataFigureCollection { id: string; name: string }
export type BackyDataFigureLoader = (collectionId: string, options: { signal: AbortSignal; requestedFields?: string[] }) => Promise<unknown[]>;
export type BackyDataRecord = Record<string, unknown>;
export const BACKY_DATA_FIGURE_KEYS: readonly BackyDataFigureKey[] = ['backy.chart.line', 'backy.chart.bar', 'backy.table.data'];
export const isBackyDataFigureKey = (value: unknown): value is BackyDataFigureKey => BACKY_DATA_FIGURE_KEYS.includes(value as BackyDataFigureKey);
/** Collection figures always specify their public field boundary, including on refresh. */
export const getBackyDataFigureRequestedFields = (config: BackyDataFigureConfig): string[] | null => {
  const keys: unknown[] = config.componentKey === 'backy.table.data'
    ? Array.isArray(config.columns) ? config.columns.map((column) => column?.key) : []
    : Array.isArray(config.yFields) && config.yFields.length ? [config.xField, ...config.yFields] : [];
  if (!keys.length || keys.some((key) => typeof key !== 'string' || !key.trim() || ['__proto__', 'constructor', 'prototype'].includes(key))) return null;
  return Array.from(new Set(keys as string[]));
};
/** Public loaders use these actionable messages; never expose arbitrary transport/server details. */
export const getBackyDataFigureError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const known = [
    'Published collection data could not be loaded. Try again.',
    'Published collection data returned an invalid response.',
    'This collection is unavailable for public article figures.',
    'Published collection pagination is invalid. Try again.',
    'The collection returned a record unavailable for public article figures.',
    'The collection changed while loading. Try again.',
    'Published collection pagination did not advance. Try again.',
    'This collection is private.',
    'This data source is unavailable.',
    'Data must be an array of rows.',
    'This figure supports at most 5,000 published records. Choose a smaller collection.',
    'The collection returned a record unavailable for public figures.',
    'The collection changed or returned incomplete data. Reload to try again.',
    'Published collection data could not be loaded.',
    'This collection is unavailable for public figures.',
    'Choose a published collection for this figure.',
    'Published collection data is unavailable.',
    'Choose explicit fields for this collection figure.',
    'A selected field is undeclared or unavailable for public figures.',
  ];
  return known.includes(message) || /^This figure supports collections with at most [\d,]+ published records\. Choose a smaller collection\.$/.test(message)
    ? message : 'Could not load this data. Check the source and try again.';
};
export const getBackyDataValue = (row: BackyDataRecord, key: string): unknown => Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;

export const formatBackyDataValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Invalid number';
  if (typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value) ?? 'Unsupported value'; } catch { return 'Unsupported value'; }
};
export const parseBackyDataNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
export const inspectBackyDataRecords = (input: unknown) => {
  if (!Array.isArray(input)) return { rows: [] as BackyDataRecord[], invalidRows: 0, error: 'Data must be an array of rows.' };
  const rows = input.filter((row): row is BackyDataRecord => row !== null && typeof row === 'object' && !Array.isArray(row));
  return { rows, invalidRows: input.length - rows.length, error: '' };
};
export const getBackyDataFields = (rows: BackyDataRecord[]): string[] => Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
export const resolveBackyDataColumns = (config: BackyDataFigureConfig, rows: BackyDataRecord[]): BackyDataFigureColumn[] => {
  const columns = Array.isArray(config.columns) ? config.columns.filter((column) => column && typeof column.key === 'string' && column.key.trim()).map((column) => ({ ...column, label: typeof column.label === 'string' && column.label.trim() ? column.label : column.key })) : [];
  return Array.isArray(config.columns) ? columns : config.source?.type === 'collection' ? [] : getBackyDataFields(rows).map((key) => ({ key, label: key }));
};
export const queryBackyDataTable = (rows: BackyDataRecord[], columns: BackyDataFigureColumn[], options: {
  query?: string; sortKey?: string; sortDirection?: 'asc' | 'desc'; page?: number; pageSize?: number;
}) => {
  const query = (options.query || '').trim().toLocaleLowerCase();
  const filtered = rows.map((row, index) => ({ row, index })).filter(({ row }) => !query || columns.some(({ key }) => formatBackyDataValue(getBackyDataValue(row, key)).toLocaleLowerCase().includes(query)));
  if (options.sortKey) filtered.sort((left, right) => {
    const a = getBackyDataValue(left.row, options.sortKey!);
    const b = getBackyDataValue(right.row, options.sortKey!);
    const aNumber = parseBackyDataNumber(a), bNumber = parseBackyDataNumber(b);
    const comparison = aNumber !== null && bNumber !== null ? aNumber - bNumber : formatBackyDataValue(a).localeCompare(formatBackyDataValue(b), undefined, { numeric: true });
    return (options.sortDirection === 'desc' ? -comparison : comparison) || left.index - right.index;
  });
  const pageSize = Number.isFinite(options.pageSize) ? Math.max(1, Math.min(100, Math.floor(options.pageSize!))) : 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Number.isFinite(options.page) ? Math.max(0, Math.min(pageCount - 1, Math.floor(options.page!))) : 0;
  return { rows: filtered.slice(page * pageSize, (page + 1) * pageSize).map(({ row }) => row), total: filtered.length, page, pageCount, pageSize };
};
export const buildBackyDataChart = (rows: BackyDataRecord[], config: BackyDataFigureConfig) => {
  const fields = getBackyDataFields(rows);
  const xField = typeof config.xField === 'string' && config.xField ? config.xField : config.source?.type === 'collection' ? '' : fields[0] || '';
  const yFields = Array.isArray(config.yFields) ? Array.from(new Set(config.yFields.filter((field) => typeof field === 'string' && field))) : config.source?.type === 'collection' ? [] : fields.filter((field) => field !== xField && rows.some((row) => parseBackyDataNumber(getBackyDataValue(row, field)) !== null));
  const labels = rows.map((row, index) => formatBackyDataValue(getBackyDataValue(row, xField)) || `Row ${index + 1}`);
  const series = yFields.map((key) => ({ key, values: rows.map((row) => parseBackyDataNumber(getBackyDataValue(row, key))) }));
  const numbers = series.flatMap((item) => item.values.filter((value): value is number => value !== null));
  let minimum = 0, maximum = 0;
  for (const value of numbers) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  if (!numbers.length || minimum === maximum) { minimum = 0; maximum = 1; }
  return { xField, labels, series, minimum, maximum, invalidValues: series.reduce((total, item) => total + item.values.filter((value) => value === null).length, 0), hasValues: numbers.length > 0 && Boolean(xField) };
};
export function createBackyDataFigureSample(componentKey: BackyDataFigureKey): BackyDataFigureConfig {
  return { componentKey, title: 'Sample data — replace with your own', source: { type: 'inline' }, xField: 'Month', yFields: ['Visitors', 'Subscribers'],
    columns: [{ key: 'Month', label: 'Month' }, { key: 'Visitors', label: 'Visitors' }, { key: 'Subscribers', label: 'Subscribers' }],
    records: [{ Month: 'January', Visitors: 120, Subscribers: 18 }, { Month: 'February', Visitors: 180, Subscribers: 25 }, { Month: 'March', Visitors: 160, Subscribers: 32 }, { Month: 'April', Visitors: 230, Subscribers: 41 }],
  };
}
