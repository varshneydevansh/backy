import { getBackyDataFigureError, getBackyDataFigureRequestedFields, inspectBackyDataRecords } from '@backy-cms/core';
import type { BackyDataFigureConfig, BackyDataFigureLoader } from '@backy-cms/core';

export interface DataFigureLoadState {
  identity: object;
  epoch: number;
  status: 'loading' | 'ready' | 'error';
  records: unknown;
  error: string;
}

/** A replacement load invalidates even a loader that ignores AbortSignal. */
export function createDataFigureLoadSession() {
  let controller: AbortController | undefined;
  let generation = 0;
  const cancel = () => { generation += 1; controller?.abort(); controller = undefined; };
  const start = async (identity: object, epoch: number, collectionId: string, loader: BackyDataFigureLoader, publish: (state: DataFigureLoadState) => void, requestedFields?: string[]) => {
    cancel();
    const current = generation;
    const request = new AbortController();
    controller = request;
    publish({ identity, epoch, status: 'loading', records: [], error: '' });
    try {
      let records: unknown = await loader(collectionId, { signal: request.signal, requestedFields });
      if (inspectBackyDataRecords(records).error) throw new Error('Data must be an array of rows.');
      if (requestedFields) {
        const inspection = inspectBackyDataRecords(records);
        if (inspection.invalidRows) throw new Error('Data must be an array of rows.');
        records = inspection.rows.map((row) => Object.fromEntries(requestedFields.map((key) => {
          const value = Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null;
          if (value !== null && value !== undefined && typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) throw new Error('A selected field is undeclared or unavailable for public figures.');
          return [key, value ?? null];
        })));
      }
      if (current === generation && !request.signal.aborted) publish({ identity, epoch, status: 'ready', records, error: '' });
    } catch (error) {
      if (current === generation && !request.signal.aborted) publish({ identity, epoch, status: 'error', records: [], error: getBackyDataFigureError(error) });
    }
  };
  return { start, cancel };
}

/** SSR hydration wins until an explicit reload. Reload errors never reveal saved or previous rows. */
export function resolveDataFigureView(config: BackyDataFigureConfig, editable: boolean, loader: BackyDataFigureLoader | undefined, identity: object, epoch: number, loaded: DataFigureLoadState | null) {
  const source = config.source;
  if (source !== undefined && (!source || typeof source !== 'object' || !['inline', 'collection'].includes(source.type))) return { status: 'error' as const, records: [], error: 'Choose a valid data source in the figure settings.' };
  if (source?.type !== 'collection') return { status: 'ready' as const, records: config.records ?? [], error: '' };
  if (!source.collectionId || typeof source.collectionId !== 'string') return { status: 'error' as const, records: [], error: 'Choose a collection to show its data.' };
  if (!editable && epoch === 0 && config.dataStatus === 'error') return { status: 'error' as const, records: [], error: getBackyDataFigureError(config.dataError) };
  if (!editable && !getBackyDataFigureRequestedFields(config)) return { status: 'error' as const, records: [], error: 'Choose explicit fields for this collection figure.' };
  if (!editable && epoch === 0) {
    if (config.dataStatus === 'ready' && Array.isArray(config.records)) return { status: 'ready' as const, records: config.records, error: '' };
  }
  if (!loader) return { status: 'error' as const, records: [], error: 'This data source is unavailable here.' };
  return loaded?.identity === identity && loaded.epoch === epoch ? loaded : { status: 'loading' as const, records: [], error: '' };
}
