import type { BackyVisitorProviderIdentity } from '@backy-cms/core';
export class VisitorAuthProviderError extends Error { constructor() { super('Visitor identity provider unavailable'); } }
export const visitorProviderConfig = () => {
  const url = (process.env.BACKY_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  // Never use service-role/admin secrets to authenticate a visitor.
  const key = (process.env.BACKY_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) throw new VisitorAuthProviderError();
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(parsed.hostname))) throw new VisitorAuthProviderError();
  return { url, key, issuer: `${url}/auth/v1` };
};
async function call(path: string, method: string, body?: unknown, token?: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const config = visitorProviderConfig();
  let response: Response;
  try { response = await fetch(`${config.url}/auth/v1/${path}`, { method, headers: { apikey: config.key, authorization: `Bearer ${token || config.key}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000), redirect: 'error' }); }
  catch { throw new VisitorAuthProviderError(); }
  if (response.status >= 500 || response.status === 429) { void response.body?.cancel().catch(() => {}); throw new VisitorAuthProviderError(); }
  // User metadata and provider errors are untrusted; never retain an unbounded response.
  const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader?.cancel().catch(() => {}); reject(new VisitorAuthProviderError()); }, 10000); });
  try {
    if (Number(response.headers.get('content-length')) > 131072) throw new Error();
    if (reader) while (true) { const { done, value } = await Promise.race([reader.read(), deadline]); if (done) break; size += value.byteLength; if (size > 131072) throw new Error(); chunks.push(value); }
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return { ok: response.ok, data: data as Record<string, unknown> };
  } catch { void reader?.cancel().catch(() => {}); throw new VisitorAuthProviderError(); }
  finally { if (timer) clearTimeout(timer); }
}
export async function verifyVisitorProviderToken(token: string): Promise<BackyVisitorProviderIdentity | null> {
  if (!token || token.length > 8192 || token.startsWith('bkv_')) return null;
  // A verified provider request establishes subject identity; decoded/unverified JWT metadata is never admission evidence.
  const result = await call('user', 'GET', undefined, token), user = result.data;
  if (!result.ok || typeof user.id !== 'string' || !user.id || typeof user.email !== 'string' || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at)) || user.is_anonymous === true) return null;
  return { issuer: visitorProviderConfig().issuer, subject: user.id, email: user.email.trim().toLowerCase() };
}
export async function authenticateVisitorProvider(email: string, password: string): Promise<BackyVisitorProviderIdentity | null> {
  return (await authenticateVisitorProviderSession(email, password))?.identity || null;
}
/** Server request scope only. Never persist or return this provider access token to a website. */
export async function authenticateVisitorProviderSession(email: string, password: string): Promise<{ identity: BackyVisitorProviderIdentity; accessToken: string } | null> {
  const result = await call('token?grant_type=password', 'POST', { email, password });
  if (!result.ok || typeof result.data.access_token !== 'string') return null;
  const identity = await verifyVisitorProviderToken(result.data.access_token);
  return identity && identity.email === email.trim().toLowerCase() ? { identity, accessToken: result.data.access_token } : null;
}
/** A successful request only starts provider confirmations; it does not update Backy membership. */
export async function requestVisitorProviderEmailChange(accessToken: string, email: string, returnUrl: string): Promise<boolean> {
  const result = await call(`user?redirect_to=${encodeURIComponent(returnUrl)}`, 'PUT', { email }, accessToken);
  return result.ok;
}
export async function signupVisitorProvider(email: string, password: string, returnUrl: string, challenge?: string): Promise<BackyVisitorProviderIdentity | null> {
  const result = await call(`signup?redirect_to=${encodeURIComponent(returnUrl)}`, 'POST', { email, password, ...(challenge ? { code_challenge: challenge, code_challenge_method: 's256' } : {}) });
  // A fake/confirmation-pending user object does not create a member or session.
  return result.ok && typeof result.data.access_token === 'string' ? verifyVisitorProviderToken(result.data.access_token) : null;
}
export async function recoverVisitorProvider(email: string, returnUrl: string, challenge?: string): Promise<void> {
  await call(`recover?redirect_to=${encodeURIComponent(returnUrl)}`, 'POST', { email, ...(challenge ? { code_challenge: challenge, code_challenge_method: 's256' } : {}) });
}
export async function resetVisitorProviderPassword(token: string, password: string): Promise<boolean> { return (await call('user', 'PUT', { password }, token)).ok; }

/** Only a verifier consumed from Backy's private flow repository may reach this exchange. */
export async function exchangeVisitorProviderCode(code: string, verifier: string): Promise<{ identity: BackyVisitorProviderIdentity; accessToken: string } | null> {
  const result = await call('token?grant_type=pkce', 'POST', { auth_code: code, code_verifier: verifier });
  if (!result.ok || typeof result.data.access_token !== 'string') return null;
  const identity = await verifyVisitorProviderToken(result.data.access_token);
  return identity ? { identity, accessToken: result.data.access_token } : null;
}
