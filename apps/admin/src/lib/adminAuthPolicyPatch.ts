/** Settings GET includes managed credential summaries; generic PATCH edits policy only. */
export function adminAuthPolicyPatch(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const policy = input as Record<string, unknown>;
  return Object.fromEntries(['requireTwoFactor', 'inviteOnly', 'minPasswordLength', 'sessionTimeoutMinutes', 'allowedEmailDomains']
    .filter(field => Object.prototype.hasOwnProperty.call(policy, field))
    .map(field => [field, policy[field]]));
}
