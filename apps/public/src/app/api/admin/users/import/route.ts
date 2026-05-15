import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getAdminAuthPolicySettings,
  validateAdminEmailDomainPolicy,
  validateAdminInviteOnlyActivationPolicy,
  validateAdminInviteOnlyCreatePolicy,
} from '@/lib/admin-auth/emailPolicy';
import { createAdminUser, getAdminSettings, getAdminUserByEmail, listAdminUsers, updateAdminUser } from '@/lib/backyStore';
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

type AdminUserForSafeguard = {
  id: string;
  role: AdminUserRole;
  status: AdminUserStatus;
};

type ImportError = {
  row: number;
  email?: string;
  code?: string;
  message: string;
};

type ImportMode = 'create' | 'upsert';

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

const normalizeImportMode = (value: string | null): ImportMode => (
  value === 'upsert' ? 'upsert' : 'create'
);

const isActiveAdminAuthority = (user: AdminUserForSafeguard) => (
  (user.role === 'owner' || user.role === 'admin') && user.status === 'active'
);

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readBillingSeatPolicy = (settings: unknown) => {
  const root = toRecord(settings);
  const integrations = toRecord(root.integrations);
  const commerce = toRecord(integrations.commerce);
  const limit = Number(commerce.seatLimit);
  const overageMode = typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn';

  return {
    seatLimit: Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : 3,
    overageMode,
    billingPlan: typeof commerce.billingPlan === 'string' ? commerce.billingPlan : 'free',
  };
};

const enforceImportSeatBillingLimit = (
  settings: unknown,
  currentUserCount: number,
  requestedCreateCount: number,
  requestId: string,
) => {
  const policy = readBillingSeatPolicy(settings);
  if (policy.overageMode === 'block' && currentUserCount + requestedCreateCount > policy.seatLimit) {
    return errorResponse(
      402,
      'BILLING_SEAT_LIMIT',
      `The ${policy.billingPlan} billing policy allows ${policy.seatLimit} user seat${policy.seatLimit === 1 ? '' : 's'}. This import would create ${requestedCreateCount} new user${requestedCreateCount === 1 ? '' : 's'} and exceed the limit.`,
      requestId,
      {
        seatLimit: policy.seatLimit,
        currentUserCount,
        requestedCreateCount,
      },
    );
  }

  return null;
};

const wouldRemoveLastAdminAuthority = (
  users: AdminUserForSafeguard[],
  existingUser: AdminUserForSafeguard,
  nextUser: AdminUserForSafeguard,
) => {
  const nextUsers = users.map((user) => (user.id === existingUser.id ? nextUser : user));
  return nextUsers.filter(isActiveAdminAuthority).length === 0;
};

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
  const { searchParams } = new URL(request.url);
  const mode = normalizeImportMode(searchParams.get('mode'));
  const dryRun = searchParams.get('dryRun') === 'true';
  const access = await requireAdminAccess(request, requestId, { permission: 'users.create' });
  if (access instanceof NextResponse) {
    return access;
  }
  if (mode === 'upsert') {
    const manageAccess = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
    if (manageAccess instanceof NextResponse) {
      return manageAccess;
    }
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
    const updatedUsers = [];
    const beforeUpdatedUsers = [];
    const errors = [...parsed.errors];
    const authPolicySettings = await getAdminAuthPolicySettings();
    let skipped = 0;

    if (!dryRun) {
      if (repositories) {
        const [settings, existingUsers] = await Promise.all([
          repositories.settings.get(),
          repositories.users.list({ limit: 1, offset: 0 }),
        ]);
        const existingEmails = await Promise.all(parsed.rows.map((row) => repositories.users.getByEmail(row.email)));
        const requestedCreateCount = existingEmails.filter((user) => !user).length;
        const billingLimitError = enforceImportSeatBillingLimit(
          settings,
          existingUsers.pagination.total,
          requestedCreateCount,
          requestId,
        );
        if (billingLimitError) {
          return billingLimitError;
        }
      } else {
        const existingUsers = listAdminUsers();
        const existingEmails = new Set(existingUsers.map((user) => user.email));
        const requestedCreateCount = parsed.rows.filter((row) => !existingEmails.has(row.email)).length;
        const billingLimitError = enforceImportSeatBillingLimit(
          getAdminSettings(),
          existingUsers.length,
          requestedCreateCount,
          requestId,
        );
        if (billingLimitError) {
          return billingLimitError;
        }
      }
    }

    for (const row of parsed.rows) {
      const existing = repositories
        ? await repositories.users.getByEmail(row.email)
        : getAdminUserByEmail(row.email);

      if (existing) {
        if (mode !== 'upsert') {
          skipped += 1;
          continue;
        }

        if (access.session && existing.id === access.session.user.id) {
          errors.push({ row: row.row, email: row.email, message: 'Current signed-in admin cannot be updated through CSV import.' });
          skipped += 1;
          continue;
        }

        const nextUser = {
          ...existing,
          fullName: row.fullName,
          role: row.role,
          status: row.status,
        };
        const inviteOnlyPolicy = await validateAdminInviteOnlyActivationPolicy(existing.status, row.status, authPolicySettings);
        if (!inviteOnlyPolicy.ok) {
          errors.push({
            row: row.row,
            email: row.email,
            code: 'INVITE_ONLY_REQUIRED',
            message: inviteOnlyPolicy.message,
          });
          skipped += 1;
          continue;
        }
        const allUsers = repositories
          ? (await repositories.users.list({ limit: 1000, offset: 0 })).items
          : listAdminUsers();

        if (wouldRemoveLastAdminAuthority(allUsers, existing, nextUser)) {
          errors.push({ row: row.row, email: row.email, message: 'Import would remove the last active owner/admin.' });
          skipped += 1;
          continue;
        }

        if (dryRun) {
          updatedUsers.push(nextUser);
          continue;
        }

        beforeUpdatedUsers.push(existing);
        const updated = repositories
          ? (await repositories.users.update(existing.id, {
              fullName: row.fullName,
              role: row.role,
              status: row.status,
            })).item
          : updateAdminUser(existing.id, {
              fullName: row.fullName,
              role: row.role,
              status: row.status,
            });

        if (updated) {
          updatedUsers.push(updated);
        } else {
          skipped += 1;
        }
        continue;
      }

      const emailPolicy = await validateAdminEmailDomainPolicy(row.email, authPolicySettings);
      if (!emailPolicy.ok) {
        errors.push({
          row: row.row,
          email: row.email,
          code: 'EMAIL_DOMAIN_NOT_ALLOWED',
          message: emailPolicy.message,
        });
        skipped += 1;
        continue;
      }

      const inviteOnlyPolicy = await validateAdminInviteOnlyCreatePolicy(row.status, authPolicySettings);
      if (!inviteOnlyPolicy.ok) {
        errors.push({
          row: row.row,
          email: row.email,
          code: 'INVITE_ONLY_REQUIRED',
          message: inviteOnlyPolicy.message,
        });
        skipped += 1;
        continue;
      }

      if (dryRun) {
        createdUsers.push({
          id: `preview_${row.email.replace(/[^a-z0-9]+/gi, '_')}`,
          fullName: row.fullName,
          email: row.email,
          role: row.role,
          status: row.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActiveAt: row.status === 'active' ? new Date().toISOString() : null,
          invitedAt: row.status === 'invited' ? new Date().toISOString() : null,
        });
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

    const changedUsers = [...createdUsers, ...updatedUsers];

    if (!dryRun) {
      await recordAdminAudit({
        repositories,
        entity: 'user',
        entityId: 'import',
        action: mode === 'upsert' ? 'user.import.upsert' : 'user.import.create',
        after: {
          created: createdUsers.length,
          updated: updatedUsers.length,
          skipped,
          errors: errors.length,
          createdUsers,
          updatedUsers,
        },
        before: {
          updatedUsers: beforeUpdatedUsers,
        },
        metadata: {
          mode,
          created: createdUsers.length,
          updated: updatedUsers.length,
          skipped,
          errors: errors.length,
          rollbackAvailable: changedUsers.length > 0,
          createdUserIds: createdUsers.map((user) => user.id),
          updatedUserIds: updatedUsers.map((user) => user.id),
          userIds: changedUsers.map((user) => user.id),
          emails: changedUsers.map((user) => user.email),
          requestedById: access.session?.user.id || null,
        },
        requestId,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        users: changedUsers,
        import: {
          mode,
          dryRun,
          created: createdUsers.length,
          updated: updatedUsers.length,
          skipped,
          errors,
          rollbackAvailable: !dryRun && changedUsers.length > 0,
          rollbackRequestId: !dryRun && changedUsers.length > 0 ? requestId : null,
        },
      },
    });
  } catch (error) {
    console.error('Admin users import API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
