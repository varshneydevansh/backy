/** Actual React DOM/component/transport with deferred synthetic HTTP; no provider/data access. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { VisitorPrivacyReview, type VisitorPrivacyReviewProps } from '../src/components/users/VisitorPrivacyReview';
type Pending = { init: RequestInit; url: URL; done: boolean; complete: (data: unknown, status?: number) => void; reject: () => void };
export const privacyFixtureSnapshot = (siteId = 'site-fixture', memberId = 'member-one') => ({
  schema: 'backy.visitor-privacy-impact.v1', siteId, memberId, memberStatus: 'active', observedAt: '2026-10-11T12:00:00.000Z', reviewMode: 'read-only-point-in-time',
  counts: { comments: 17, formSubmissions: 3, linkedContacts: 2, commentDeliveryAttempts: { total: 4, pending: 1, unknownOutcome: 1 }, formDeliveryAttempts: { total: 3, pending: 0, unknownOutcome: 1 } },
  boundaries: { contactOwnership: 'ambiguous-source-submission-link', downstreamProvenance: 'unknown', emailMatchedOwnership: false, contentInspected: false, erasurePerformed: false, providerChanged: false },
  retainedCategories: ['membership-identity', 'comments-and-moderation', 'submission-values-files-and-admin-metadata', 'source-submission-contact-copies', 'delivery-evidence'],
});
export async function runVisitorPrivacyMountedTests(container: HTMLElement) {
  const realFetch = globalThis.fetch, requests: Pending[] = [], checks: { name: string; passed: boolean }[] = [];
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
    const row: Pending = { url: new URL(String(input), location.origin), init, done: false, reject: () => { row.done = true; reject(Error('Sensitive upstream details must not appear')); },
      complete(data, status = 200) { row.done = true; resolve(new Response(JSON.stringify({ success: status === 200, requestId: 'synthetic-request', ...(status === 200 ? { data } : { error: { message: 'Sensitive upstream details must not appear' } }) }), { status })); } };
    requests.push(row); // Deliberately ignores abort: authority must still discard late completions.
  })) as typeof fetch;
  const root = createRoot(container);
  let props: VisitorPrivacyReviewProps = { siteId: 'site-fixture', memberId: 'member-one', memberStatus: 'active', canReview: true, contextKey: 'owner-one' };
  const render = async (patch: Partial<VisitorPrivacyReviewProps> = {}) => { props = { ...props, ...patch }; await act(async () => root.render(<VisitorPrivacyReview {...props} />)); };
  const check = (name: string, passed: boolean) => { checks.push({ name, passed }); if (!passed) throw Error(name); };
  const text = () => container.textContent || '';
  const visible = () => Boolean(container.querySelector('[data-testid="visitor-privacy-snapshot"]'));
  const click = async (label?: string) => { const button = Array.from(container.querySelectorAll('button')).find(b => label ? b.textContent === label : /^(Privacy review|Review again)$/.test(b.textContent || '')); if (!button) throw Error('Missing review action'); await act(async () => { button.click(); if (!label) button.click(); }); };
  const pending = () => { const row = requests.findLast(r => !r.done); if (!row) throw Error('Missing explicit request'); return row; };
  const complete = async (row: Pending, data: unknown, status = 200) => { await act(async () => row.complete(data, status)); };
  const valid = () => privacyFixtureSnapshot(props.siteId, props.memberId);
  try {
    await render(); check('Mount does not automatically load private counts', requests.length === 0 && !visible());
    await click(); check('Repeated click admits exactly one GET with captured exact site/member', requests.length === 1 && pending().url.pathname.endsWith('/sites/site-fixture/visitors/members/member-one/privacy-impact') && pending().init.method === 'GET');
    await complete(pending(), { ...valid(), email: 'private@example.test', content: '<img src="https://remote.invalid">' });
    check('Shows counts and explicit retention/ambiguous/unknown limitations', visible() && text().includes('17') && text().includes('ownership ambiguous') && text().includes('unknown provenance') && text().includes('remain retained') && text().includes('does not erase'));
    check('Identity/body extras never rendered or exported', !text().includes('private@example.test') && !text().includes('<img') && !container.querySelector('img,iframe,a,input,textarea'));
    await click(); check('Refresh removes old snapshot before response', !visible()); const oldSite = pending();
    await render({ siteId: 'other-site' }); check('Site switch hides old counts and does not auto-load', !visible() && requests.length === 2);
    await complete(oldSite, privacyFixtureSnapshot()); check('Late previous-site success cannot show a snapshot', !visible());
    await click(); const oldMember = pending(); await render({ memberId: 'member-two' }); await complete(oldMember, privacyFixtureSnapshot('other-site', 'member-one'));
    check('Late previous-member success ignored without automatic loads', !visible() && requests.length === 3);
    await click(); const oldActor = pending(); await render({ contextKey: 'owner-two' }); await complete(oldActor, {}, 403);
    check('Old actor denial does not poison current context', !text().includes('access denied') && !visible());
    await click(); await complete(pending(), valid()); await render({ canReview: false });
    check('Permission loss hides cached counts immediately and disables action', !visible() && container.querySelector<HTMLButtonElement>('button')?.disabled === true);
    const deniedCount = requests.length; await click(); check('Denied UI cannot issue request', requests.length === deniedCount);
    await render({ canReview: true }); check('Permission restoration remains explicit', requests.length === deniedCount && !visible());
    await click(); const revoked = pending(); await render({ canReview: false }); await complete(revoked, valid()); check('Held response after permission loss cannot restore snapshot', !visible());
    await render({ canReview: true }); await click(); const oldReturn = pending(); await render({ siteId: 'site-fixture' }); await render({ siteId: 'other-site' }); await complete(oldReturn, valid()); check('Away/back scope never acknowledges old request', !visible());
    for (const status of [401, 403]) {
      await click(); await complete(pending(), valid()); check(`Snapshot loaded before current ${status}`, visible());
      await click(); await complete(pending(), {}, status); const n = requests.length;
      check(`Current ${status} clears snapshot and shows fixed safe access denial`, !visible() && text().includes('access denied') && !text().includes('Sensitive upstream'));
      await act(async () => { await Promise.resolve(); }); check(`Current ${status} never automatically retries`, requests.length === n);
    }
    await click(); await complete(pending(), valid()); await click(); await complete(pending(), {}, 503); check('Failed request clears old snapshot and hides upstream errors', !visible() && text().includes('could not load') && !text().includes('Sensitive upstream'));
    await click(); await act(async () => pending().reject()); check('Network failure is safe and does not retain counts', !visible() && text().includes('could not load') && !text().includes('Sensitive upstream'));
    for (const [name, change] of [
      ['foreign site', { siteId: 'foreign-site' }], ['foreign member', { memberId: 'foreign-member' }], ['negative count', { counts: { ...valid().counts, comments: -1 } }],
      ['delivery subsets exceed total', { counts: { ...valid().counts, commentDeliveryAttempts: { total: 1, pending: 1, unknownOutcome: 1 } } }], ['unsafe boundary', { boundaries: { ...valid().boundaries, erasurePerformed: true } }],
    ] as const) { await click(); await complete(pending(), { ...valid(), ...change }); check(`Incompatible ${name} fails closed`, !visible() && text().includes('could not load')); }
    await click(); const closed = pending(); await click('Close review'); await complete(closed, valid()); check('Close cancels held request and removes all results', !visible() && !container.querySelector('[aria-label="Privacy review results"]'));
    await click(); await complete(pending(), valid()); await render({ memberStatus: 'removed' }); check('Membership status change immediately invalidates snapshot', !visible());
    check('Every request is private cookie-only GET with no body, authorization or query', requests.every(r => r.init.method === 'GET' && !r.init.body && r.init.credentials === 'include' && r.init.cache === 'no-store' && r.init.redirect === 'error' && !r.url.search && !['authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'].some(key => new Headers(r.init.headers).has(key))));
    return { ok: true, boundary: 'Actual mounted React DOM/component/client; synthetic deferred transport, not production proof.', checks, requests: requests.length };
  } catch (error) { return { ok: false, checks, error: error instanceof Error ? error.message : String(error) }; }
  finally { await act(async () => root.unmount()); globalThis.fetch = realFetch; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false; }
}
