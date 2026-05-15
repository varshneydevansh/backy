/**
 * Admin user ownership transfer endpoint.
 *
 * POST /api/admin/users/:userId/transfer-ownership
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminUserById, listAdminUsers, updateAdminUser } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  )
);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { roles: ['owner'] });
  if (access instanceof NextResponse) {
    return access;
  }
  const ownerSession = access.type === 'session' ? access.session : null;
  if (!ownerSession || ownerSession.user.role !== 'owner') {
    return errorResponse(403, 'OWNER_SESSION_REQUIRED', 'Ownership transfer requires an active owner session.', requestId);
  }

  try {
    const { userId } = await context.params;
    const previousOwnerId = ownerSession.user.id;

    if (userId === previousOwnerId) {
      return errorResponse(409, 'CURRENT_USER_LOCKED', 'Choose another active admin before transferring ownership.', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const [previousOwner, newOwner] = await Promise.all([
        repositories.users.getById(previousOwnerId),
        repositories.users.getById(userId),
      ]);

      if (!previousOwner || previousOwner.role !== 'owner' || previousOwner.status !== 'active') {
        return errorResponse(403, 'OWNER_SESSION_REQUIRED', 'Ownership transfer requires an active owner account.', requestId);
      }
      if (!newOwner) {
        return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
      }
      if (newOwner.status !== 'active') {
        return errorResponse(409, 'TARGET_USER_NOT_ACTIVE', 'Activate the target user before transferring ownership.', requestId);
      }

      const promotedOwner = (await repositories.users.update(newOwner.id, {
        role: 'owner',
        status: 'active',
      })).item;
      const demotedOwner = (await repositories.users.update(previousOwner.id, {
        role: 'admin',
        status: 'active',
      })).item;
      const users = (await repositories.users.list({ limit: 100, offset: 0 })).items;

      await recordAdminAudit({
        repositories,
        entity: 'user',
        entityId: promotedOwner.id,
        action: 'user.ownership.transfer',
        before: {
          previousOwner,
          newOwner,
        },
        after: {
          previousOwner: demotedOwner,
          newOwner: promotedOwner,
        },
        metadata: {
          previousOwnerId: previousOwner.id,
          previousOwnerEmail: previousOwner.email,
          newOwnerId: promotedOwner.id,
          newOwnerEmail: promotedOwner.email,
          previousOwnerRole: demotedOwner.role,
          newOwnerRole: promotedOwner.role,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          transfer: {
            previousOwner: demotedOwner,
            newOwner: promotedOwner,
          },
          users,
        },
      });
    }

    const previousOwner = getAdminUserById(previousOwnerId);
    const newOwner = getAdminUserById(userId);

    if (!previousOwner || previousOwner.role !== 'owner' || previousOwner.status !== 'active') {
      return errorResponse(403, 'OWNER_SESSION_REQUIRED', 'Ownership transfer requires an active owner account.', requestId);
    }
    if (!newOwner) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }
    if (newOwner.status !== 'active') {
      return errorResponse(409, 'TARGET_USER_NOT_ACTIVE', 'Activate the target user before transferring ownership.', requestId);
    }

    const promotedOwner = updateAdminUser(newOwner.id, {
      role: 'owner',
      status: 'active',
    });
    const demotedOwner = updateAdminUser(previousOwner.id, {
      role: 'admin',
      status: 'active',
    });

    if (!promotedOwner || !demotedOwner) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    await recordAdminAudit({
      entity: 'user',
      entityId: promotedOwner.id,
      action: 'user.ownership.transfer',
      before: {
        previousOwner,
        newOwner,
      },
      after: {
        previousOwner: demotedOwner,
        newOwner: promotedOwner,
      },
      metadata: {
        previousOwnerId: previousOwner.id,
        previousOwnerEmail: previousOwner.email,
        newOwnerId: promotedOwner.id,
        newOwnerEmail: promotedOwner.email,
        previousOwnerRole: demotedOwner.role,
        newOwnerRole: promotedOwner.role,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        transfer: {
          previousOwner: demotedOwner,
          newOwner: promotedOwner,
        },
        users: listAdminUsers(),
      },
    });
  } catch (error) {
    console.error('Admin ownership transfer API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
