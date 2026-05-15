import type { AdminAccessContext } from '@/lib/adminAccess';

export type AdminTeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface AdminTeamMembershipSubject {
  id: string;
  userId: string;
  role: AdminTeamRole;
}

export interface AdminTeamMembershipPolicyViolation {
  status: number;
  code: string;
  message: string;
}

export function getAdminTeamMembershipPolicyViolation(input: {
  access: AdminAccessContext;
  members: AdminTeamMembershipSubject[];
  targetMember?: AdminTeamMembershipSubject | null;
  nextRole?: AdminTeamRole | null;
  action: 'upsert' | 'update' | 'remove';
}): AdminTeamMembershipPolicyViolation | null {
  const { access, members, targetMember, nextRole, action } = input;
  const isRoleChange = Boolean(targetMember && nextRole && nextRole !== targetMember.role);
  const isRemoval = action === 'remove';
  const isSelfMutation = Boolean(
    access.session?.user.id &&
    targetMember?.userId === access.session.user.id &&
    (isRemoval || isRoleChange),
  );

  if (isSelfMutation) {
    return {
      status: 403,
      code: 'SELF_TEAM_MEMBER_RESTRICTED',
      message: 'Use another owner/admin account to change your own team membership.',
    };
  }

  const ownerCount = members.filter((member) => member.role === 'owner').length;
  const wouldRemoveFinalOwner = Boolean(
    targetMember?.role === 'owner' &&
    ownerCount <= 1 &&
    (isRemoval || (nextRole !== undefined && nextRole !== null && nextRole !== 'owner')),
  );

  if (wouldRemoveFinalOwner) {
    return {
      status: 409,
      code: 'FINAL_TEAM_OWNER_REQUIRED',
      message: isRemoval
        ? 'Add another owner before removing the final team owner.'
        : 'Add another owner before changing the final team owner role.',
    };
  }

  const touchesOwnerRole = nextRole === 'owner' || targetMember?.role === 'owner';
  if (touchesOwnerRole && access.session?.user.role !== 'owner') {
    return {
      status: 403,
      code: 'OWNER_ROLE_RESTRICTED',
      message: action === 'remove'
        ? 'Only workspace owners can remove owner team members.'
        : 'Only workspace owners can change owner team roles.',
    };
  }

  return null;
}
