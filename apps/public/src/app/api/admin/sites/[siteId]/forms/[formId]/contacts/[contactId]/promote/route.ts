import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonObject, Contact } from '@backy-cms/core';
import { recordAdminAudit } from '@/lib/adminAudit';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getAdminAuthPolicySettings,
  validateAdminEmailDomainPolicy,
  validateAdminInviteOnlyCreatePolicy,
} from '@/lib/admin-auth/emailPolicy';
import { createAdminInviteToken } from '@/lib/admin-auth/sessionStore';
import { addPersistedInviteToken } from '@/lib/adminAuthTokenPersistence';
import {
  createAdminUser,
  getAdminSettings,
  getAdminUserByEmail,
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
  listAdminUsers,
  updateContactStatus,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    contactId: string;
  }>;
}

type PromotionRole = 'viewer' | 'editor';
type PromotionStatus = 'invited' | 'active';
type ParsedPromotionValue<TValue> = { value: TValue; invalid?: true };

const PROMOTION_SOURCE_KEY = '__backyPromotion';
const PROMOTION_ROLES: PromotionRole[] = ['viewer', 'editor'];
const PROMOTION_STATUSES: PromotionStatus[] = ['invited', 'active'];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeRole = (value: unknown): ParsedPromotionValue<PromotionRole> => {
  if (value === undefined || value === null || value === '') return { value: 'viewer' };
  const role = typeof value === 'string' ? value.trim() : '';
  return PROMOTION_ROLES.includes(role as PromotionRole)
    ? { value: role as PromotionRole }
    : { value: 'viewer', invalid: true };
};

const normalizeStatus = (value: unknown): ParsedPromotionValue<PromotionStatus> => {
  if (value === undefined || value === null || value === '') return { value: 'invited' };
  const status = typeof value === 'string' ? value.trim() : '';
  return PROMOTION_STATUSES.includes(status as PromotionStatus)
    ? { value: status as PromotionStatus }
    : { value: 'invited', invalid: true };
};

const readBillingSeatPolicy = (settings: unknown) => {
  const root = isRecord(settings) ? settings : {};
  const integrations = isRecord(root.integrations) ? root.integrations : {};
  const commerce = isRecord(integrations.commerce) ? integrations.commerce : {};
  const limit = Number(commerce.seatLimit);
  const overageMode = typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn';

  return {
    seatLimit: Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : 3,
    overageMode,
    billingPlan: typeof commerce.billingPlan === 'string' ? commerce.billingPlan : 'free',
  };
};

const enforceSeatBillingLimit = (
  settings: unknown,
  currentUserCount: number,
  requestId: string,
) => {
  const policy = readBillingSeatPolicy(settings);
  if (policy.overageMode === 'block' && currentUserCount >= policy.seatLimit) {
    return errorResponse(
      402,
      'BILLING_SEAT_LIMIT',
      `The ${policy.billingPlan} billing policy allows ${policy.seatLimit} user seat${policy.seatLimit === 1 ? '' : 's'}. Update Settings billing limits before promoting another contact to a user.`,
      requestId,
    );
  }

  return null;
};

const normalizeExpiresInMinutes = (value: unknown): ParsedPromotionValue<number> => {
  if (value === undefined || value === null || value === '') return { value: 10080 };
  if (typeof value === 'string' && value.trim() === '') return { value: 10080 };
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 30 && minutes <= 43200
    ? { value: minutes }
    : { value: 10080, invalid: true };
};

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const appendPromotionNote = (notes: string | null | undefined, userId: string, existingUser: boolean): string => {
  const suffix = `Promoted to ${existingUser ? 'existing' : 'new'} Backy user ${userId}.`;
  const current = notes?.trim() || '';
  return current.includes(suffix) ? current : [current, suffix].filter(Boolean).join('\n');
};

const promotionSourceValues = (
  contact: Contact,
  input: {
    userId: string;
    email: string;
    role: PromotionRole;
    status: PromotionStatus | string;
    existingUser: boolean;
    promotedAt: string;
    requestId: string;
    inviteUrl?: string;
  },
): Record<string, unknown> => ({
  ...(isRecord(contact.sourceValues) ? contact.sourceValues : {}),
  [PROMOTION_SOURCE_KEY]: {
    target: 'user',
    userId: input.userId,
    email: input.email,
    role: input.role,
    status: input.status,
    existingUser: input.existingUser,
    promotedAt: input.promotedAt,
    requestId: input.requestId,
    ...(input.inviteUrl ? { inviteUrl: input.inviteUrl } : {}),
  },
});

const auditMetadata = (value: Record<string, unknown>): BackyJsonObject => value as BackyJsonObject;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const formAccess = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (formAccess instanceof NextResponse) return formAccess;
  const userAccess = await requireAdminAccess(request, requestId, { permission: 'users.create' });
  if (userAccess instanceof NextResponse) return userAccess;

  try {
    const { siteId, formId, contactId } = await params;
    const body = await parseJsonBody(request);
    const roleFilter = normalizeRole(body.role);
    if (roleFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_CONTACT_PROMOTION_ROLE', 'Role must be viewer or editor.', requestId);
    }
    const statusFilter = normalizeStatus(body.status);
    if (statusFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_CONTACT_PROMOTION_STATUS', 'Status must be invited or active.', requestId);
    }
    const role = roleFilter.value;
    const status = statusFilter.value;
    const createInvite = body.createInvite !== false;
    const expiresInMinutesFilter = normalizeExpiresInMinutes(body.expiresInMinutes);
    if (expiresInMinutesFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_CONTACT_PROMOTION_INVITE_EXPIRY', 'Invite expiry must be an integer between 30 minutes and 30 days.', requestId);
    }
    const expiresInMinutes = expiresInMinutesFilter.value;
    const authPolicySettings = await getAdminAuthPolicySettings();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);

      const contact = await repositories.forms.getContactById(site.id, form.id, contactId);
      if (!contact) return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
      if (contact.status !== 'qualified') {
        return errorResponse(409, 'CONTACT_NOT_QUALIFIED', 'Mark this contact qualified before promoting it.', requestId);
      }

      const email = normalizeEmail(contact.email);
      if (!email || !email.includes('@')) {
        return errorResponse(400, 'CONTACT_MISSING_EMAIL', 'Promoting a contact to user requires a valid contact email.', requestId);
      }

      const existingUser = await repositories.users.getByEmail(email);
      if (!existingUser) {
        const emailPolicy = await validateAdminEmailDomainPolicy(email, authPolicySettings);
        if (!emailPolicy.ok) {
          return errorResponse(400, 'EMAIL_DOMAIN_NOT_ALLOWED', emailPolicy.message, requestId);
        }
        const inviteOnlyPolicy = await validateAdminInviteOnlyCreatePolicy(status, authPolicySettings);
        if (!inviteOnlyPolicy.ok) {
          return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
        }
        const [settings, existingUsers] = await Promise.all([
          repositories.settings.get(),
          repositories.users.list({ limit: 1, offset: 0 }),
        ]);
        const billingLimitError = enforceSeatBillingLimit(settings, existingUsers.pagination.total, requestId);
        if (billingLimitError) {
          return billingLimitError;
        }
      }

      const user = existingUser || (await repositories.users.create({
        fullName: contact.name?.trim() || email,
        email,
        role,
        status,
      })).item;
      if (!existingUser) {
        await recordAdminAudit({
          repositories,
          entity: 'user',
          entityId: user.id,
          action: 'create',
          after: user,
          metadata: auditMetadata({ email: user.email, role: user.role, status: user.status, source: 'contact-promotion' }),
          requestId,
        });
      }

      const invite = createInvite && user.status === 'invited'
        ? createAdminInviteToken({
          user,
          requestedById: formAccess.session?.user.id || null,
          origin: request.headers.get('origin') || request.nextUrl.origin,
          expiresInMinutes,
          persistInMemory: false,
        })
        : null;
      if (invite) {
        const currentSettings = await repositories.settings.get();
        await repositories.settings.update({
          auth: addPersistedInviteToken(currentSettings.auth, invite),
        });
      }
      const promotedAt = new Date().toISOString();
      const updatedContact = (await repositories.forms.updateContact(site.id, contact.id, {
        notes: appendPromotionNote(contact.notes, user.id, Boolean(existingUser)),
        sourceValues: promotionSourceValues(contact, {
          userId: user.id,
          email: user.email,
          role,
          status: user.status,
          existingUser: Boolean(existingUser),
          promotedAt,
          requestId,
          inviteUrl: invite?.inviteUrl,
        }),
      })).item;

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: formAccess.session?.user.id,
        entity: 'contact',
        entityId: contact.id,
        action: 'contact.promote.user',
        before: contact,
        after: updatedContact,
        metadata: auditMetadata({
          userId: user.id,
          email: user.email,
          role,
          status: user.status,
          existingUser: Boolean(existingUser),
          inviteTokenId: invite?.id || null,
          expiresAt: invite?.expiresAt || null,
        }),
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: { contact: updatedContact, user, existingUser: Boolean(existingUser), invite },
        contact: updatedContact,
        user,
        invite,
      }, { status: existingUser ? 200 : 201 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const form = getFormById(site.id, formId);
    if (!form) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);

    const contact = getContactById(contactId);
    if (!contact || contact.siteId !== site.id || contact.formId !== form.id) {
      return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
    }
    if (contact.status !== 'qualified') {
      return errorResponse(409, 'CONTACT_NOT_QUALIFIED', 'Mark this contact qualified before promoting it.', requestId);
    }

    const email = normalizeEmail(contact.email);
    if (!email || !email.includes('@')) {
      return errorResponse(400, 'CONTACT_MISSING_EMAIL', 'Promoting a contact to user requires a valid contact email.', requestId);
    }

    const existingUser = getAdminUserByEmail(email);
    if (!existingUser) {
      const emailPolicy = await validateAdminEmailDomainPolicy(email, authPolicySettings);
      if (!emailPolicy.ok) {
        return errorResponse(400, 'EMAIL_DOMAIN_NOT_ALLOWED', emailPolicy.message, requestId);
      }
      const inviteOnlyPolicy = await validateAdminInviteOnlyCreatePolicy(status, authPolicySettings);
      if (!inviteOnlyPolicy.ok) {
        return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
      }
      const billingLimitError = enforceSeatBillingLimit(getAdminSettings(), listAdminUsers().length, requestId);
      if (billingLimitError) {
        return billingLimitError;
      }
    }

    const user = existingUser || createAdminUser({
      fullName: contact.name?.trim() || email,
      email,
      role,
      status,
    });
    if (!existingUser) {
      await recordAdminAudit({
        entity: 'user',
        entityId: user.id,
        action: 'create',
        after: user,
        metadata: auditMetadata({ email: user.email, role: user.role, status: user.status, source: 'contact-promotion' }),
        requestId,
      });
    }

    const invite = createInvite && user.status === 'invited'
      ? createAdminInviteToken({
        user,
        requestedById: formAccess.session?.user.id || null,
        origin: request.headers.get('origin') || request.nextUrl.origin,
        expiresInMinutes,
      })
      : null;
    const promotedAt = new Date().toISOString();
    const updatedContact = updateContactStatus(contact.id, {
      notes: appendPromotionNote(contact.notes, user.id, Boolean(existingUser)),
      sourceValues: promotionSourceValues(contact, {
        userId: user.id,
        email: user.email,
        role,
        status: user.status,
        existingUser: Boolean(existingUser),
        promotedAt,
        requestId,
        inviteUrl: invite?.inviteUrl,
      }),
    });
    if (!updatedContact) {
      return errorResponse(409, 'CONTACT_UPDATE_FAILED', 'Unable to update promoted contact.', requestId);
    }

    await recordAdminAudit({
      siteId: site.id,
      actorId: formAccess.session?.user.id,
      entity: 'contact',
      entityId: contact.id,
      action: 'contact.promote.user',
      before: contact,
      after: updatedContact,
      metadata: auditMetadata({
        userId: user.id,
        email: user.email,
        role,
        status: user.status,
        existingUser: Boolean(existingUser),
        inviteTokenId: invite?.id || null,
        expiresAt: invite?.expiresAt || null,
      }),
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: { contact: updatedContact, user, existingUser: Boolean(existingUser), invite },
      contact: updatedContact,
      user,
      invite,
    }, { status: existingUser ? 200 : 201 });
  } catch (error) {
    console.error('Admin contact promotion API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
