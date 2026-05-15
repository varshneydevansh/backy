import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { listAdminAudit, recordAdminAudit } from '@/lib/adminAudit';
import { deleteAdminUser, getAdminUserByEmail, getAdminUserById, listAdminUsers, updateAdminUser } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

type RollbackUserSnapshot = {
  id: string;
  fullName: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'invited' | 'suspended';
  avatarUrl?: string | null;
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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const isRole = (value: unknown): value is RollbackUserSnapshot['role'] => (
  value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer'
);

const isStatus = (value: unknown): value is RollbackUserSnapshot['status'] => (
  value === 'active' || value === 'inactive' || value === 'invited' || value === 'suspended'
);

const toUserSnapshot = (value: unknown): RollbackUserSnapshot | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.fullName !== 'string' ||
    typeof value.email !== 'string' ||
    !isRole(value.role) ||
    !isStatus(value.status)
  ) {
    return null;
  }

  return {
    id: value.id,
    fullName: value.fullName,
    email: value.email,
    role: value.role,
    status: value.status,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
  };
};

const toUserSnapshots = (value: unknown): RollbackUserSnapshot[] => (
  Array.isArray(value)
    ? value.map(toUserSnapshot).filter((item): item is RollbackUserSnapshot => Boolean(item))
    : []
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const manageAccess = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (manageAccess instanceof NextResponse) {
    return manageAccess;
  }
  const deleteAccess = await requireAdminAccess(request, requestId, { permission: 'users.delete' });
  if (deleteAccess instanceof NextResponse) {
    return deleteAccess;
  }

  try {
    const body = await parseJsonBody(request);
    const importRequestId = typeof body.requestId === 'string' && body.requestId.trim()
      ? body.requestId.trim()
      : '';
    const repositories = !shouldUseDemoStoreFallback()
      ? await getRequiredDatabaseRepositories()
      : null;
    const auditResult = await listAdminAudit({
      repositories,
      filters: {
        entity: 'user',
        entityId: 'import',
        ...(importRequestId ? { requestId: importRequestId } : {}),
        limit: importRequestId ? 5 : 25,
        offset: 0,
      },
    });
    const importLog = auditResult.items.find((log) => (
      (log.action === 'user.import.create' || log.action === 'user.import.upsert') &&
      (log.metadata?.rollbackAvailable === true || Number(log.metadata?.created || 0) > 0 || Number(log.metadata?.updated || 0) > 0)
    ));

    if (!importLog) {
      return errorResponse(404, 'IMPORT_ROLLBACK_NOT_FOUND', 'No rollback-capable user import batch was found.', requestId);
    }
    const alreadyRolledBack = auditResult.items.some((log) => (
      log.action === 'user.import.rollback' &&
      log.metadata?.importLogId === importLog.id
    ));
    if (alreadyRolledBack) {
      return errorResponse(409, 'IMPORT_ALREADY_ROLLED_BACK', 'The selected user import batch has already been rolled back.', requestId);
    }

    const createdUsers = toUserSnapshots(isRecord(importLog.after) ? importLog.after.createdUsers : null);
    const beforeUpdatedUsers = toUserSnapshots(isRecord(importLog.before) ? importLog.before.updatedUsers : null);
    if (createdUsers.length === 0 && beforeUpdatedUsers.length === 0) {
      return errorResponse(409, 'IMPORT_ROLLBACK_EMPTY', 'The selected import batch does not contain rollback snapshots.', requestId);
    }

    const deletedUserIds: string[] = [];
    const restoredUserIds: string[] = [];
    const skipped: Array<{ userId: string; email: string; reason: string }> = [];

    for (const user of createdUsers) {
      if (manageAccess.session?.user.id === user.id) {
        skipped.push({ userId: user.id, email: user.email, reason: 'Current signed-in admin cannot be deleted by import rollback.' });
        continue;
      }

      const existing = repositories
        ? await repositories.users.getById(user.id)
        : getAdminUserById(user.id);
      if (!existing) {
        skipped.push({ userId: user.id, email: user.email, reason: 'Created user is already absent.' });
        continue;
      }

      const deleted = repositories
        ? await repositories.users.delete(user.id)
        : deleteAdminUser(user.id);
      if (deleted) {
        deletedUserIds.push(user.id);
      } else {
        skipped.push({ userId: user.id, email: user.email, reason: 'Created user could not be deleted.' });
      }
    }

    for (const snapshot of beforeUpdatedUsers) {
      const existing = repositories
        ? await repositories.users.getById(snapshot.id)
        : getAdminUserById(snapshot.id);
      if (!existing) {
        skipped.push({ userId: snapshot.id, email: snapshot.email, reason: 'Updated user no longer exists.' });
        continue;
      }
      const emailOwner = repositories
        ? await repositories.users.getByEmail(snapshot.email)
        : getAdminUserByEmail(snapshot.email);
      if (emailOwner && emailOwner.id !== snapshot.id) {
        skipped.push({ userId: snapshot.id, email: snapshot.email, reason: 'Original email is now owned by another user.' });
        continue;
      }

      const restored = repositories
        ? (await repositories.users.update(snapshot.id, {
            fullName: snapshot.fullName,
            email: snapshot.email,
            role: snapshot.role,
            status: snapshot.status,
            avatarUrl: snapshot.avatarUrl,
          })).item
        : updateAdminUser(snapshot.id, {
            fullName: snapshot.fullName,
            email: snapshot.email,
            role: snapshot.role,
            status: snapshot.status,
            avatarUrl: snapshot.avatarUrl,
          });
      if (restored) {
        restoredUserIds.push(snapshot.id);
      } else {
        skipped.push({ userId: snapshot.id, email: snapshot.email, reason: 'Updated user could not be restored.' });
      }
    }

    const allUsers = repositories
      ? (await repositories.users.list({ limit: 1000, offset: 0 })).items
      : listAdminUsers();
    await recordAdminAudit({
      repositories,
      entity: 'user',
      entityId: 'import',
      action: 'user.import.rollback',
      before: {
        importLogId: importLog.id,
        importRequestId: importLog.requestId,
        createdUsers,
        beforeUpdatedUsers,
      },
      after: {
        deleted: deletedUserIds.length,
        restored: restoredUserIds.length,
        skipped: skipped.length,
        users: allUsers.filter((user) => deletedUserIds.includes(user.id) || restoredUserIds.includes(user.id)),
      },
      metadata: {
        importLogId: importLog.id,
        importRequestId: importLog.requestId || null,
        importAction: importLog.action,
        deletedUserIds,
        restoredUserIds,
        skipped,
        requestedById: manageAccess.session?.user.id || null,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        rollback: {
          importRequestId: importLog.requestId || null,
          importAction: importLog.action,
          deleted: deletedUserIds.length,
          restored: restoredUserIds.length,
          skipped,
          deletedUserIds,
          restoredUserIds,
        },
      },
    });
  } catch (error) {
    console.error('Admin users import rollback API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
