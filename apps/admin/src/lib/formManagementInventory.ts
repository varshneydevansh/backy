import { getFormWithSubmissions, listFormContacts } from './adminContentApi';

export const FORM_MANAGEMENT_INVENTORY_LIMIT = 50_000;
interface Pagination { total: number; limit: number; offset: number; hasMore: boolean }
interface ScopedRow { id: string; siteId: string; formId: string }

/** Complete a bounded read before exposing it to local search, counts or CSV export.
 * Offset paging is not a database snapshot: concurrent changes require a refresh.
 * Detect observable drift rather than silently exporting a partial inventory.
 */
export async function collectFormManagementInventory<T extends ScopedRow>(
  siteId: string,
  formId: string,
  readPage: (offset: number, limit: number) => Promise<{ rows: T[]; pagination?: Pagination }>,
  maximum = FORM_MANAGEMENT_INVENTORY_LIMIT,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (;;) {
    const { rows: page, pagination: p } = await readPage(rows.length, 100);
    const fail = () => new Error('The complete form inbox could not be loaded. Refresh and retry; partial results cannot be searched or exported.');
    if (!p || !Array.isArray(page) || !Number.isSafeInteger(p.total) || p.total < 0
      || !Number.isSafeInteger(p.limit) || p.limit < 1 || p.limit > 100
      || p.offset !== rows.length || typeof p.hasMore !== 'boolean' || page.length > p.limit) throw fail();
    if (p.total > maximum) throw new Error(`This form exceeds the ${maximum.toLocaleString('en-US')} record management limit. The inbox was not loaded; partial exports are disabled.`);
    if (total !== undefined && total !== p.total) throw fail();
    total = p.total;
    for (const row of page) {
      if (!row || typeof row.id !== 'string' || !row.id || row.siteId !== siteId || row.formId !== formId || ids.has(row.id)) throw fail();
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > total || p.hasMore !== (rows.length < total) || (p.hasMore && page.length === 0)) throw fail();
    if (!p.hasMore) return rows;
  }
}

export async function getCompleteFormWithSubmissions(siteId: string, formId: string) {
  let form: Awaited<ReturnType<typeof getFormWithSubmissions>>['form'] | undefined;
  const rows = await collectFormManagementInventory(siteId, formId, async (offset, limit) => {
    const result = await getFormWithSubmissions(siteId, formId, { offset, limit, requirePagination: true });
    if (result.form.siteId !== siteId || result.form.id !== formId) throw new Error('The returned form does not match the selected site and form.');
    form = result.form;
    return { rows: result.submissions.data, pagination: result.submissions.pagination };
  });
  return { form: form!, submissions: { data: rows, pagination: { total: rows.length, limit: rows.length, offset: 0, hasMore: false } } };
}

export async function listCompleteFormContacts(siteId: string, formId: string) {
  const contacts = await collectFormManagementInventory(siteId, formId, async (offset, limit) => {
    const result = await listFormContacts(siteId, formId, { offset, limit, requirePagination: true });
    return { rows: result.contacts, pagination: result.pagination };
  });
  return { contacts, count: contacts.length };
}
