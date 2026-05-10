import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createAdminUser, getAdminUserByEmail } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

type AdminUserRole = 'owner' | 'admin' | 'editor' | 'viewer';
type AdminUserStatus = 'active' | 'inactive' | 'invited' | 'suspended';

type ParsedImportRow = {
  row: number;
  fullName: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
};

type ImportError = {
  row: number;
  email?: string;
  message: string;
};

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
        details,
      },
    },
    { status },
  )
);

const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

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
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const normalizeRole = (value: string): AdminUserRole | null => {
  const role = value.trim().toLowerCase();
  return role === 'owner' || role === 'admin' || role === 'editor' || role === 'viewer'
    ? role
    : null;
};

const normalizeStatus = (value: string): AdminUserStatus | null => {
  const status = value.trim().toLowerCase();
  return status === 'active' || status === 'inactive' || status === 'invited' || status === 'suspended'
    ? status
    : null;
};

const emailIsValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getColumn = (headers: string[], aliases: string[]) => (
  aliases.map((alias) => headers.indexOf(alias)).find((index) => index !== -1) ?? -1
);

const parseUserImportRows = (csv: string): { rows: ParsedImportRow[]; errors: ImportError[] } => {
  const table = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ row: 0, message: 'CSV file is empty.' }],
    };
  }

  const headers = table[0].map(normalizeHeader);
  const nameIndex = getColumn(headers, ['full_name', 'fullname', 'name']);
  const emailIndex = getColumn(headers, ['email', 'email_address']);
  const roleIndex = getColumn(headers, ['role']);
  const statusIndex = getColumn(headers, ['status']);

  if (nameIndex === -1 || emailIndex === -1) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'CSV header must include full_name and email columns.' }],
    };
  }

  const rows: ParsedImportRow[] = [];
  const errors: ImportError[] = [];
  const seenEmails = new Set<string>();

  table.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const fullName = (cells[nameIndex] || '').trim();
    const email = normalizeEmail(cells[emailIndex] || '');
    const role = roleIndex === -1 ? 'viewer' : normalizeRole(cells[roleIndex] || 'viewer');
    const status = statusIndex === -1 ? 'invited' : normalizeStatus(cells[statusIndex] || 'invited');

    if (!fullName) {
      errors.push({ row: rowNumber, email, message: 'Full name is required.' });
      return;
    }

    if (!emailIsValid(email)) {
      errors.push({ row: rowNumber, email, message: 'A valid email address is required.' });
      return;
    }

    if (!role) {
      errors.push({ row: rowNumber, email, message: 'Role must be owner, admin, editor, or viewer.' });
      return;
    }

    if (!status) {
      errors.push({ row: rowNumber, email, message: 'Status must be active, inactive, invited, or suspended.' });
      return;
    }

    if (seenEmails.has(email)) {
      errors.push({ row: rowNumber, email, message: 'Duplicate email appears more than once in the CSV.' });
      return;
    }

    seenEmails.add(email);
    rows.push({ row: rowNumber, fullName, email, role, status });
  });

  return { rows, errors };
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'users.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const csv = await request.text();
    const parsed = parseUserImportRows(csv);
    if (parsed.rows.length === 0 && parsed.errors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'No valid users were found in the CSV import.', requestId, parsed.errors);
    }

    const repositories = !shouldUseDemoStoreFallback()
      ? await getRequiredDatabaseRepositories()
      : null;

    const createdUsers = [];
    const errors = [...parsed.errors];
    let skipped = 0;

    for (const row of parsed.rows) {
      const existing = repositories
        ? await repositories.users.getByEmail(row.email)
        : getAdminUserByEmail(row.email);

      if (existing) {
        skipped += 1;
        continue;
      }

      const user = repositories
        ? (await repositories.users.create({
            fullName: row.fullName,
            email: row.email,
            role: row.role,
            status: row.status,
          })).item
        : createAdminUser(row);

      createdUsers.push(user);
    }

    await recordAdminAudit({
      repositories,
      entity: 'user',
      entityId: 'import',
      action: 'user.import.create',
      after: {
        created: createdUsers.length,
        skipped,
        errors: errors.length,
      },
      metadata: {
        created: createdUsers.length,
        skipped,
        errors: errors.length,
        userIds: createdUsers.map((user) => user.id),
        emails: createdUsers.map((user) => user.email),
        requestedById: access.session?.user.id || null,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        users: createdUsers,
        import: {
          created: createdUsers.length,
          skipped,
          errors,
        },
      },
    });
  } catch (error) {
    console.error('Admin users import API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
