import { NextRequest, NextResponse } from 'next/server';
import type { Contact } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { createContactRecord, getFormById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

interface ImportError {
  row: number;
  email?: string;
  message: string;
  details?: unknown;
}

const CONTACT_STATUSES = ['new', 'contacted', 'qualified', 'archived'] as const;
const RESERVED_COLUMNS = new Set(['name', 'email', 'phone', 'status', 'notes', 'pageId', 'postId', 'requestId', 'sourceValues']);

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details }, errorMessage: message }, { status })
);

const normalizeHeader = (value: unknown): string => (
  String(value || '').trim().replace(/[^a-zA-Z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
);

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() || null;

const parseStatus = (value: unknown): Contact['status'] => (
  CONTACT_STATUSES.includes(value as Contact['status'])
    ? value as Contact['status']
    : 'new'
);

const parseCsvRows = (source: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((items) => items.some((item) => item.trim().length > 0));
};

const parseSourceValues = (rowData: Record<string, string>) => {
  const explicit = rowData.sourceValues?.trim();
  if (explicit) {
    try {
      const parsed = JSON.parse(explicit);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { sourceValues: explicit };
    }
  }

  return Object.fromEntries(
    Object.entries(rowData)
      .filter(([key, value]) => !RESERVED_COLUMNS.has(key) && value.trim().length > 0)
      .map(([key, value]) => [key.startsWith('source') ? key.replace(/^source/, '') || key : key, value]),
  );
};

const parseContactRow = (rowData: Record<string, string>) => {
  const name = rowData.name?.trim() || null;
  const email = rowData.email?.trim() || null;
  const phone = rowData.phone?.trim() || null;
  const notes = rowData.notes?.trim() || null;

  if (!name && !email && !phone) {
    return null;
  }

  return {
    name,
    email,
    phone,
    notes,
    status: parseStatus(rowData.status?.trim()),
    pageId: rowData.pageId?.trim() || null,
    postId: rowData.postId?.trim() || null,
    requestId: rowData.requestId?.trim() || null,
    sourceValues: parseSourceValues(rowData),
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const { searchParams } = new URL(request.url);
    const upsertByEmail = searchParams.get('upsertByEmail') === 'true' || searchParams.get('upsert') === 'true';
    const csv = await request.text();
    const rows = parseCsvRows(csv);

    if (rows.length < 2) {
      return errorResponse(400, 'VALIDATION_ERROR', 'CSV import requires a header row and at least one contact row', requestId);
    }

    const headers = rows[0].map((header) => normalizeHeader(header)).filter(Boolean);
    if (headers.length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'CSV import requires at least one column header', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      const importedContacts = [];
      const errors: ImportError[] = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const [rowIndex, cells] of rows.slice(1).entries()) {
        const rowNumber = rowIndex + 2;
        const rowData = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
        const parsed = parseContactRow(rowData);

        if (!parsed) {
          skipped += 1;
          errors.push({ row: rowNumber, email: rowData.email, message: 'Contact requires a name, email, or phone.' });
          continue;
        }

        const normalizedEmail = normalizeEmail(parsed.email);
        const existing = upsertByEmail && normalizedEmail
          ? (await repositories.forms.listContacts({ siteId: site.id, formId: form.id, limit: 1000 })).items
              .find((contact) => normalizeEmail(contact.email) === normalizedEmail)
          : undefined;
        const contact = existing
          ? (await repositories.forms.updateContact(site.id, existing.id, parsed)).item
          : (await repositories.forms.createContact({
              siteId: site.id,
              formId: form.id,
              ...parsed,
              sourceSubmissionId: undefined,
              sourceIpHash: null,
            })).item;

        importedContacts.push(contact);
        if (existing) {
          updated += 1;
        } else {
          created += 1;
        }
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          formId: form.id,
          contacts: importedContacts,
          import: { created, updated, skipped, errors },
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    const importedContacts = [];
    const errors: ImportError[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [rowIndex, cells] of rows.slice(1).entries()) {
      const rowNumber = rowIndex + 2;
      const rowData = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
      const parsed = parseContactRow(rowData);

      if (!parsed) {
        skipped += 1;
        errors.push({ row: rowNumber, email: rowData.email, message: 'Contact requires a name, email, or phone.' });
        continue;
      }

      const result = createContactRecord({
        siteId: site.id,
        formId: form.id,
        ...parsed,
        sourceSubmissionId: undefined,
        sourceIpHash: null,
      }, { upsertByEmail });

      importedContacts.push(result.contact);
      if (result.existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        formId: form.id,
        contacts: importedContacts,
        import: { created, updated, skipped, errors },
      },
    });
  } catch (error) {
    console.error('Admin form contacts import API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
