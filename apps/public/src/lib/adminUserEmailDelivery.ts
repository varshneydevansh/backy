import type { AdminInviteToken, AdminPasswordResetToken } from '@/lib/admin-auth/sessionStore';
import {
  getEmailDeliveryConfig,
  sendEmailMessage,
  type EmailDeliveryConfig,
  type EmailDeliveryMessage,
  type EmailDeliveryProvider,
} from '@/lib/formEmailDelivery';

export type AdminUserDeliveryStatus = 'queued' | 'failed' | 'not_configured';

export interface AdminUserDeliveryResult {
  attempted: boolean;
  provider: EmailDeliveryProvider;
  status: AdminUserDeliveryStatus;
  deliveryConfigured: boolean;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface AdminUserEmailTarget {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
}

const baseAdminUserMessage = (input: {
  config: EmailDeliveryConfig;
  user: AdminUserEmailTarget;
  requestId: string;
  subject: string;
  text: string;
  entityType: NonNullable<EmailDeliveryMessage['entityType']>;
  values: Record<string, unknown>;
}): EmailDeliveryMessage => ({
  to: input.user.email,
  from: input.config.from,
  subject: input.subject,
  text: input.text,
  siteId: 'admin',
  userId: input.user.id,
  entityType: input.entityType,
  status: input.user.status,
  requestId: input.requestId,
  values: {
    userId: input.user.id,
    email: input.user.email,
    role: input.user.role,
    status: input.user.status,
    ...input.values,
  },
});

const buildInviteMessage = (input: {
  config: EmailDeliveryConfig;
  user: AdminUserEmailTarget;
  invite: AdminInviteToken;
  requestId: string;
  context?: {
    teamName?: string;
    teamRole?: string;
  };
}): EmailDeliveryMessage => baseAdminUserMessage({
  config: input.config,
  user: input.user,
  requestId: input.requestId,
  entityType: 'admin-invite',
  subject: `You're invited to Backy`,
  text: [
    `Hi ${input.user.fullName || input.user.email},`,
    '',
    input.context?.teamName
      ? `You have been invited to the ${input.context.teamName} team in Backy.`
      : 'You have been invited to the Backy admin workspace.',
    '',
    `Role: ${input.user.role}`,
    ...(input.context?.teamRole ? [`Team role: ${input.context.teamRole}`] : []),
    `Invite expires: ${input.invite.expiresAt}`,
    `Request: ${input.requestId}`,
    '',
    'Accept your invite:',
    input.invite.inviteUrl,
    '',
    'If you were not expecting this invite, ignore this email.',
  ].join('\n'),
  values: {
    inviteTokenId: input.invite.id,
    expiresAt: input.invite.expiresAt,
    inviteUrl: input.invite.inviteUrl,
    ...(input.context?.teamName ? { teamName: input.context.teamName } : {}),
    ...(input.context?.teamRole ? { teamRole: input.context.teamRole } : {}),
  },
});

const buildPasswordResetMessage = (input: {
  config: EmailDeliveryConfig;
  user: AdminUserEmailTarget;
  reset: AdminPasswordResetToken;
  requestId: string;
}): EmailDeliveryMessage => baseAdminUserMessage({
  config: input.config,
  user: input.user,
  requestId: input.requestId,
  entityType: 'admin-password-reset',
  subject: 'Reset your Backy admin password',
  text: [
    `Hi ${input.user.fullName || input.user.email},`,
    '',
    'A Backy admin password reset was requested for your account.',
    '',
    `Reset expires: ${input.reset.expiresAt}`,
    `Request: ${input.requestId}`,
    '',
    'Reset your password:',
    input.reset.resetUrl,
    '',
    'If you did not request this reset, contact your workspace owner.',
  ].join('\n'),
  values: {
    resetTokenId: input.reset.id,
    expiresAt: input.reset.expiresAt,
    resetUrl: input.reset.resetUrl,
  },
});

const deliverAdminUserMessage = async (
  config: EmailDeliveryConfig,
  message: EmailDeliveryMessage,
): Promise<AdminUserDeliveryResult> => {
  try {
    const result = await sendEmailMessage(config, message);
    return {
      attempted: true,
      provider: config.provider,
      status: 'queued',
      deliveryConfigured: true,
      statusCode: result.statusCode,
      metadata: result.metadata,
    };
  } catch (error) {
    return {
      attempted: true,
      provider: config.provider,
      status: 'failed',
      deliveryConfigured: false,
      error: error instanceof Error ? error.message : 'Admin user email delivery failed.',
    };
  }
};

export const deliverAdminInviteEmail = async (input: {
  user: AdminUserEmailTarget;
  invite: AdminInviteToken;
  requestId: string;
  context?: {
    teamName?: string;
    teamRole?: string;
  };
}): Promise<AdminUserDeliveryResult> => {
  const config = getEmailDeliveryConfig();
  return deliverAdminUserMessage(config, buildInviteMessage({ config, ...input }));
};

export const deliverAdminPasswordResetEmail = async (input: {
  user: AdminUserEmailTarget;
  reset: AdminPasswordResetToken;
  requestId: string;
}): Promise<AdminUserDeliveryResult> => {
  const config = getEmailDeliveryConfig();
  return deliverAdminUserMessage(config, buildPasswordResetMessage({ config, ...input }));
};
