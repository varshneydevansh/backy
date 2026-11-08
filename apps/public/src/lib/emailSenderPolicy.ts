/** Server-managed sender selection. This module never stores provider credentials or creates mailboxes. */
const POLICY_ENV_KEY = 'BACKY_EMAIL_SITE_SENDERS';
const POLICY_ERROR = 'BACKY_EMAIL_SITE_SENDERS must map canonical site IDs to plain sender mailbox addresses.';
export class EmailSenderPolicyError extends Error {
  constructor(public readonly reason: 'invalid-policy' | 'invalid-site-id') {
    super(reason === 'invalid-policy' ? POLICY_ERROR : 'A canonical site ID is required for site email delivery.');
    this.name = 'EmailSenderPolicyError';
  }
}
export const isCanonicalEmailSiteId = (value: string): boolean => /^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(value);
export const isPlainEmailSenderAddress = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 254 || /[\u0000-\u0020\u007f]/.test(value)) return false;
  const [local, domain, extra] = value.split('@');
  if (!local || !domain || extra !== undefined || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) && domain.length <= 253 && domain.split('.').length > 1 && domain.split('.').every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
};
const readSenderMap = (env: Record<string, string | undefined>): Record<string, string> => {
  const raw = env[POLICY_ENV_KEY]?.trim();
  if (!raw) return Object.create(null) as Record<string, string>;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new EmailSenderPolicyError('invalid-policy'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.entries(parsed).every(([siteId, sender]) => isCanonicalEmailSiteId(siteId) && isPlainEmailSenderAddress(sender))) throw new EmailSenderPolicyError('invalid-policy');
  return parsed as Record<string, string>;
};
export const resolveEmailSiteSender = (siteId: string, defaultFrom: string, env: Record<string, string | undefined> = process.env) => {
  if (!isCanonicalEmailSiteId(siteId)) throw new EmailSenderPolicyError('invalid-site-id');
  const senders = readSenderMap(env);
  const mapped = Object.prototype.hasOwnProperty.call(senders, siteId);
  return { from: mapped ? senders[siteId] : defaultFrom, source: mapped ? 'site-mapping' as const : 'default' as const, siteId };
};
export const getEmailSenderPolicySummary = (siteId?: string, env: Record<string, string | undefined> = process.env) => {
  let configurationValid = true, siteSpecificSenderConfigured = false;
  try {
    const senders = readSenderMap(env);
    if (siteId !== undefined && !isCanonicalEmailSiteId(siteId)) throw new EmailSenderPolicyError('invalid-site-id');
    siteSpecificSenderConfigured = Boolean(siteId && Object.prototype.hasOwnProperty.call(senders, siteId));
  } catch { configurationValid = false; }
  return {
    schema: 'backy.email.sender-policy.v1',
    selection: 'server-configured-site-map',
    envKey: POLICY_ENV_KEY,
    mappingConfigured: Boolean(env[POLICY_ENV_KEY]?.trim()),
    configurationValid,
    siteSpecificSenderConfigured,
    authorization: 'Configuration allowlist only; the provider must authorize the selected existing sender.',
    providerCredentials: 'server-only-deployment-wide',
    capabilities: { outboundExistingSender: true, inbox: false, mailboxProvisioning: false, campaigns: false, perPurposeSenderRouting: false },
    authenticationVerified: false,
    outboundDeliveryVerified: false,
    ...(configurationValid ? {} : { error: POLICY_ERROR }),
  };
};
