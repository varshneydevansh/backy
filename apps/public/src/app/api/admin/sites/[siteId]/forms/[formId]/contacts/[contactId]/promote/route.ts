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
  getAdminUserByEmail,
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
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

const PROMOTION_SOURCE_KEY = '__backyPromotion';

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

const normalizeRole = (value: unknown): PromotionRole => (
  value === 'editor' ? 'editor' : 'viewer'
);

const normalizeStatus = (value: unknown): PromotionStatus => (
  value === 'active' ? 'active' : 'invited'
);

const normalizeExpiresInMinutes = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return 10080;
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return null;
  const normalized = Math.round(minutes);
  return normalized >= 30 && normalized <= 43200 ? normalized : null;
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
    const role = normalizeRole(body.role);
    const status = normalizeStatus(body.status);
    const createInvite = body.createInvite !== false;
    const expiresInMinutes = normalizeExpiresInMinutes(body.expiresInMinutes);
    const authPolicySettings = await getAdminAuthPolicySettings();
    if (!expiresInMinutes) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Invite expiry must be between 30 minutes and 30 days.', requestId);
    }

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
