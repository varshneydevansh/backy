import { collectCompleteExportPages } from './collectionExportPagination';
export class FormsInventoryIncompleteError extends Error {
  code = 'FORMS_INVENTORY_INCOMPLETE';
  constructor() { super('The forms inventory could not be read completely. Retry after content changes finish.'); }
}
export async function collectCompleteFormsInventory<T extends { id: string; siteId: string }>(
  siteId: string,
  read: Parameters<typeof collectCompleteExportPages<T>>[0],
  accepts: (item: T) => boolean = () => true,
): Promise<T[]> {
  try { return await collectCompleteExportPages(read, item => item.siteId === siteId && accepts(item)); }
  catch { throw new FormsInventoryIncompleteError(); }
}
