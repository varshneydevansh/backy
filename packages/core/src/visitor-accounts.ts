import type { BackyVisitorErasureRepository } from './visitor-erasure';
import type { BackyVisitorPrivacyImpactRepository } from './visitor-privacy';
/** Operator-managed website admission policy. Disabled until persisted provider and exact origins are configured. */
export interface BackyVisitorAccountSettings {
  enabled: boolean; registrationEnabled?: boolean; allowedOrigins: string[]; returnUrls: string[];
}
/** Visitor identities are site members, never CMS operators. No provider token or credential is public. */
export interface BackySiteVisitor {
  id: string; siteId: string; email: string; displayName: string; status: 'active' | 'suspended' | 'removed';
  createdAt: string; updatedAt: string;
}
export interface BackyVisitorProviderIdentity { issuer: string; subject: string; email: string; }
export interface BackyVisitorSessionRecord { tokenHash: string; siteId: string; memberId: string; expiresAt: string; createdAt: string; expectedEmail?: string; }
export interface BackyVisitorMemberManagementResult {
  member: BackySiteVisitor; revokedSessions: number; revokedRecoveryChallenges: number;
}
/** Private operator admission management. Access removal retains attribution and identity history; it is not erasure. */
export interface BackyVisitorMemberManagementContext { actorId?: string | null; requestId?: string; }
export interface BackyVisitorMemberManagementRepository {
  list(siteId: string, input: { limit: number; offset: number; status?: BackySiteVisitor['status']; search?: string }): Promise<{ members: BackySiteVisitor[]; limit: number; offset: number; hasMore: boolean }>;
  getById(siteId: string, memberId: string): Promise<BackySiteVisitor | null>;
  update(siteId: string, memberId: string, input: { displayName?: string; status?: 'active' | 'suspended' }, context?: BackyVisitorMemberManagementContext): Promise<BackyVisitorMemberManagementResult | null>;
  revokeSessions(siteId: string, memberId: string, context?: BackyVisitorMemberManagementContext): Promise<BackyVisitorMemberManagementResult | null>;
  removeAccess(siteId: string, memberId: string, context?: BackyVisitorMemberManagementContext): Promise<BackyVisitorMemberManagementResult | null>;
}
export interface BackyVisitorEmailChangeAdmission {
  member: BackySiteVisitor; revokedSessions: number; revokedRecoveryChallenges: number;
}
export interface BackyVisitorEmailChangeReconciliation extends BackyVisitorEmailChangeAdmission {
  synchronizedMemberships: number;
}
/** Caller supplies freshly provider-verified identities, never decoded token claims. No provider tokens are persisted. */
export interface BackyVisitorEmailChangeRepository {
  /** Commit subject-wide session/challenge revocation before initiating the shared provider email change. */
  admit(siteId: string, memberId: string, tokenHash: string, identity: BackyVisitorProviderIdentity, targetEmail: string): Promise<BackyVisitorEmailChangeAdmission | null>;
  /** Confirmed identity reconciles existing active/suspended memberships; never enrolls or revives removed memberships. Retryable after rollback. */
  reconcile(siteId: string, identity: BackyVisitorProviderIdentity): Promise<BackyVisitorEmailChangeReconciliation | null>;
}
/** Private, expiring PKCE flow. Verifier is a server credential and must never be projected publicly. */
export interface BackyVisitorPkceFlow {
  stateHash: string; siteId: string; purpose: 'signup' | 'recovery'; origin: string; returnUrl: string;
  verifier: string; expectedEmail: string; displayName: string; memberId: string | null; expiresAt: string;
}
export interface BackyVisitorPkceRepository {
  create(flow: BackyVisitorPkceFlow): Promise<void>;
  /** Atomic delete-and-return; mismatched scope/purpose or expired flows return null. Consume before provider work. */
  consume(siteId: string, stateHash: string, origin: string, returnUrl: string, purpose: 'signup' | 'recovery'): Promise<BackyVisitorPkceFlow | null>;
}
export interface BackyVisitorAccountRepository {
  privacyErasure?: BackyVisitorErasureRepository;
  pkce?: BackyVisitorPkceRepository;
  /** Unavailable adapters fail closed for operator management instead of inventing demo members. */
  management?: BackyVisitorMemberManagementRepository;
  /** Self-service name update rechecks the exact persisted visitor session and active admission atomically. Missing adapters fail closed. */
  updateProfile?(siteId: string, memberId: string, tokenHash: string, input: { displayName: string }): Promise<BackySiteVisitor | null>;
  /** Missing adapters fail closed rather than initiating an untracked provider mutation. */
  emailChange?: BackyVisitorEmailChangeRepository;
  /** Counts-only Owner review; missing adapters fail closed and never imply erasure. */
  privacyImpact?: BackyVisitorPrivacyImpactRepository;
  /** Deny-only check; visitor APIs cannot provision or alter CMS identities. */
  isOperatorIdentity(identity: BackyVisitorProviderIdentity): Promise<boolean>;
  enroll(siteId: string, identity: BackyVisitorProviderIdentity, displayName: string): Promise<BackySiteVisitor>;
  getByIdentity(siteId: string, identity: BackyVisitorProviderIdentity): Promise<BackySiteVisitor | null>;
  getByEmail(siteId: string, email: string): Promise<BackySiteVisitor | null>;
  createSession(input: BackyVisitorSessionRecord): Promise<boolean>;
  resolveSession(siteId: string, tokenHash: string, now: string): Promise<BackySiteVisitor | null>;
  revokeSession(siteId: string, tokenHash: string): Promise<void>;
  revokeMemberSessions(siteId: string, memberId: string): Promise<void>;
  createRecoveryChallenge(input: { siteId: string; memberId: string; tokenHash: string; expiresAt: string; expectedEmail?: string }): Promise<void>;
  consumeRecoveryChallenge(siteId: string, memberId: string, tokenHash: string, now: string): Promise<boolean>;
  revokeIdentitySessions(identity: BackyVisitorProviderIdentity): Promise<void>;
  consumeRateLimit(siteId: string, keyHash: string, limit: number, windowSeconds: number): Promise<boolean>;
}

/** Public discovery describes admission requirements, never provider credentials or session values. */
export function buildBackyVisitorAccountHandoff(siteId: string, policy?: BackyVisitorAccountSettings | null) {
  const base = `/api/sites/${encodeURIComponent(siteId)}/visitor-auth`;
  const safeOrigin = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    try { const url = new URL(value); if (url.username || url.password || !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost','127.0.0.1'].includes(url.hostname)) || url.origin !== value) return null; return url.origin; } catch { return null; }
  };
  const rawOrigins: unknown[] = Array.isArray(policy?.allowedOrigins) ? policy.allowedOrigins : [];
  const allowedOrigins = rawOrigins.map(safeOrigin).filter((value): value is string => value !== null);
  const rawReturns: unknown[] = Array.isArray(policy?.returnUrls) ? policy.returnUrls : [];
  const returnUrls = rawReturns.flatMap(value => {
    if (typeof value !== 'string') return [];
    try { const url = new URL(value); return !url.username && !url.password && !url.hash && !url.search && allowedOrigins.includes(url.origin) ? [url.toString()] : []; } catch { return []; }
  });
  return {
    schemaVersion: 'backy.site-visitor-accounts.v1',
    implementation: 'source-implemented',
    runtimeRequirement: 'persisted-database-through-migration-028-and-server-configured-supabase-auth',
    policy: { enabled: policy?.enabled === true, registrationEnabled: policy?.registrationEnabled === true, configurationValid: allowedOrigins.length > 0 && returnUrls.length > 0 && allowedOrigins.length === rawOrigins.length && returnUrls.length === rawReturns.length, allowedOrigins, returnUrls },
    endpoints: { register: `${base}/register`, callback: `${base}/callback`, login: `${base}/login`, session: `${base}/session`, logout: `${base}/logout`, recovery: `${base}/recovery`, resetPassword: `${base}/reset-password`, profile: `${base}/profile`, emailChange: `${base}/email-change`, confirmEmailChange: `${base}/confirm-email-change` },
    memberManagement: { permission: 'sites.configure', runtimeRequirement: 'persisted-database-through-migration-018', endpoints: { list: `/api/admin/sites/${encodeURIComponent(siteId)}/visitors`, member: `/api/admin/sites/${encodeURIComponent(siteId)}/visitors/{memberId}`, revokeSessions: `/api/admin/sites/${encodeURIComponent(siteId)}/visitors/{memberId}/revoke-sessions` }, methods: { list: 'GET', member: ['GET','PATCH','DELETE'], revokeSessions: 'POST' }, profileFields: ['displayName'], statusChanges: ['active','suspended'], removal: 'confirmed retained access tombstone; membership identity and content attribution retained, no provider deletion or erasure; no automatic reenrollment', sessionRevocation: 'same-site sessions and recovery challenges plus safe audit mutate atomically under the member row lock; reactivation requires fresh sign-in' },
    methods: { register: 'POST', callback: 'POST', login: 'POST', session: 'GET', logout: 'POST', recovery: 'POST', resetPassword: 'POST', profile: 'PATCH', emailChange: 'POST', confirmEmailChange: 'POST' },
    requestFields: {
      register: ['email','password','returnUrl','displayName','authFlow'], verifiedEnrollment: ['accessToken','displayName'], callback: ['code','state','returnUrl'],
      login: ['email','password'], recovery: ['email','returnUrl','authFlow'], resetPassword: ['accessToken','recoveryToken','password'], pkceResetPassword: ['code','state','returnUrl','password'], profile: ['displayName'], emailChange: ['newEmail','currentPassword','returnUrl'], confirmEmailChange: ['email','password'],
    },
    emailChange: { implementation: 'source-implemented', initiation: 'Current website session plus fresh provider password; revoke all subject sessions/recovery before provider email-change initiation.202 requires provider confirmation and fresh sign-in.', completion: 'Fresh confirmed email/password must resolve the same provider identity and an existing active selected-site membership. Sync current emails across existing active/suspended memberships, revoke all subject sessions/recovery, then ordinary sign-in. No enrollment, session creation or persistent pending email/provider token.', callback: 'Scrub provider credentials before network/UI. email_change and partial confirmation callbacks open completion; callback/provider200 alone never means complete.', retention: 'Names, IDs, status, removed memberships and historical comments/forms remain unchanged.', requiredOrigin: 'Exact configured website Origin header; returnUrl exactly from the approved policy.' },
    identityBoundary: 'Verified provider subject and email enroll explicitly into one website. Login never enrolls another website. CMS operator identities are denied by provider subject or normalized email; visitor APIs never provision CMS profiles or roles.',
    sessionBoundary: 'Opaque one-hour httpOnly website cookie, separate from backy_admin_session. Session/challenge/state identities persist as SHA-256 hashes. PKCE verifier and expected identity persist privately for the bounded callback flow, never in browser storage or discovery. Visitor cookies and tokens cannot authorize operator APIs. Responses are no-store.',
    callbackFlow: { supported: ['implicit','pkce'], checkedStarter: 'pkce', initiation: 'Optional authFlow:pkce on register/recovery. Server generates S256 verifier and site/origin/return/purpose-bound single-use state.', signup: 'POST callback with code,state,returnUrl; only confirmed provider identity enrolls.', recovery: 'POST reset-password with code,state,returnUrl,password; a signup callback cannot reset a password.', expiryMinutes: 15, replay: 'Consume atomically before provider exchange. Failed exchange requires a fresh flow.', providerProof: 'pending' },
    originBoundary: 'Every account request requires a configured exact website Origin, or same-origin Fetch Metadata plus an approved Referer. Email return URLs must exactly match configured URLs. No wildcard redirects.',
    formsBoundary: 'authenticated forms require an active site visitor; adminOnly forms remain operator-owned. Verified visitorMemberId is assigned server-side and is separate from legacy operator userId.',
    commentsBoundary: 'Comments with allowGuests=false require an active site visitor. Server-derived member identity overrides submitted author email; private identity fields stay absent from public comments.',
    providerBoundary: 'The configured Supabase identity has a global credential across its explicitly joined websites. Recovery changes that provider password and revokes all visitor sessions for that subject. Operator profiles are excluded from visitor recovery/reset and email changes. Email-change initiation/completion revoke subject sessions and synchronize only existing active/suspended memberships after fresh confirmed identity verification. Provider email delivery and approved callback URLs need real certification.',
    integrationBoundary: 'The checked Next.js starter implements account UI, server-bound PKCE and retained implicit email callbacks, and same-origin account/form/comment BFFs with exact site/origin checks, server-derived identity and private multipart bytes. Real provider callback, CAPTCHA/storage/scanner and deployed browser proof remain pending. Operator member listing, display-name edits, suspension/reactivation, session revocation and retained access removal are implemented with sites.configure; Self-service display-name updates require the current active same-site visitor session; two-step verified email changes are implemented; privacy erasure remains separate work. Use distinct approved browser origins for unrelated websites: scripts on a shared origin share its trust boundary despite separate website cookies. Never ship admin keys, service-role keys, database credentials or provider tokens in discovery.',
    productionProviderProof: 'pending',
  } as const;
}
