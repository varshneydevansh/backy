import { buildBackyVisitorAccountHandoff } from '@backy-cms/core';
import type { Site } from '@/stores/mockStore';
import { siteMatchesIdentifier } from '@/lib/siteSelection';

/** Copy contracts, never cached identities, credentials, provider metadata or policy URL values. */
export function safeUsersHandoffBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

export function resolveUsersMembershipSite(sites: Site[], requestedSiteId: string): Site | undefined {
  const site = requestedSiteId ? sites.find(candidate => siteMatchesIdentifier(candidate, requestedSiteId)) : sites[0];
  const id = site?.publicSiteId || site?.id || '';
  return /^[a-zA-Z0-9_.-]{1,160}$/.test(id) ? site : undefined;
}

export function buildUsersVisitorAccountHandoff(site: Site | undefined, publicBaseUrl: string) {
  const siteId = site?.publicSiteId || site?.id || '';
  const knownScope = /^[a-zA-Z0-9_.-]{1,160}$/.test(siteId);
  const base = safeUsersHandoffBaseUrl(publicBaseUrl);
  const policy = site?.settings?.visitorAccounts;
  const canonical = buildBackyVisitorAccountHandoff(knownScope ? siteId : '', policy);
  const policyState = !knownScope ? 'unknown-site'
    : site?.status !== 'published' ? 'site-not-published'
    : !policy ? 'unknown-read-canonical-handoff'
    : !canonical.policy.enabled ? 'disabled'
    : !canonical.policy.configurationValid ? 'configuration-required'
    : 'enabled-requires-live-verification';
  const siteBase = knownScope ? `${base}/api/sites/${encodeURIComponent(siteId)}` : '';
  return {
    schemaVersion: canonical.schemaVersion,
    implementation: canonical.implementation,
    scope: { state: knownScope ? 'known-site' : 'unknown-site', siteId: knownScope ? siteId : null },
    discovery: {
      agentHandoff: siteBase ? `${siteBase}/agent-handoff` : null,
      visitorAccountsPath: 'data.handoff.visitorAccounts',
      manifest: siteBase ? `${siteBase}/manifest` : null,
      manifestPath: 'data.contract.customFrontendAgentHandoff.visitorAccounts',
      openapi: siteBase ? `${siteBase}/openapi` : null,
      openapiPath: 'x-backy-custom-frontend-agent-handoff.visitorAccounts',
      authority: 'Read the canonical selected-site handoff before integration; cached workspace policy is an observation, not connection certification.',
    },
    endpoints: knownScope ? Object.fromEntries(Object.entries(canonical.endpoints).map(([key, path]) => [key, `${base}${path}`])) : {},
    methods: canonical.methods,
    connection: {
      policyState,
      registrationEnabled: knownScope && canonical.policy.registrationEnabled,
      publicApiBaseConfigured: Boolean(base),
      runtimeRequirement: canonical.runtimeRequirement,
      requirements: ['published selected site', 'enabled visitor policy', 'exact approved website origins and return URLs', 'persisted database through migrations 017 and 018', 'server-configured Supabase Auth'],
      productionProviderProof: canonical.productionProviderProof,
      boundary: 'Implemented APIs fail closed when policy or runtime is unavailable. Enabled cached policy does not prove deployed signup, login, confirmation email or recovery callbacks.',
    },
    sdk: {
      package: '@backy/sdk-js',
      helpers: ['visitorRegister', 'visitorLogin', 'visitorSession', 'visitorLogout', 'visitorRecovery', 'visitorResetPassword', 'visitorUpdateProfile'],
      boundary: 'Visitor transport is separate from operator credentials. Opaque sessionToken options belong only on trusted servers; Node SDK calls do not automatically persist cookies.',
    },
    starter: {
      source: 'examples/custom-frontend-next',
      accountPage: '/account',
      bffRoute: '/api/backy-account/:operation',
      serverOnlyBridge: 'src/lib/visitor-bff.ts',
      routeSource: 'src/app/api/backy-account/[operation]/route.ts',
      publicUrlEnvNames: ['BACKY_VISITOR_FRONTEND_ORIGIN', 'BACKY_VISITOR_RETURN_URL'],
      boundary: 'Use the checked same-origin server-only BFF: resolve canonical site/policy, check exact origin/return URL and reissue only the selected site HttpOnly visitor cookie. Never expose operator/provider credentials or store tokens in browser storage.',
      callback: 'Implicit signup/recovery callbacks are implemented; PKCE code exchange is not implemented.',
    },
    pending: ['real provider signup/login and confirmation/recovery email callback certification', 'deployed website connection and browser proof', 'self-service email changes and privacy erasure', 'mailbox and payments integration'],
    privacy: { includesIdentity: false, excludes: ['login passwords', 'session or callback tokens', 'provider subjects', 'mail addresses', 'raw member records', 'provider secrets', 'policy origin/return URL values'] },
  } as const;
}
