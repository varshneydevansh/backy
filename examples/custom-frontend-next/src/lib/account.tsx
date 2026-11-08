'use client';
import { useEffect, useRef, useState } from 'react';

type Member = { id: string; siteId: string; email: string; displayName: string; status: 'active' };
type Mode = 'login' | 'register' | 'recovery' | 'reset-password' | 'confirm-email-change';
export function consumeVisitorCallback(urlString: string, expectedSiteId: string) {
  const url = new URL(urlString), fragment = new URLSearchParams(url.hash.slice(1));
  const accessToken = fragment.get('access_token') || '', type = fragment.get('type');
  const recoveryToken = url.searchParams.get('backyVisitorRecovery') || '';
  const siteId = url.searchParams.get('backySiteId');
  const partialConfirmation = 'Confirmation link accepted. Please proceed to confirm link sent to the other email';
  const emailChange = type === 'email_change' || url.searchParams.get('type') === 'email_change' || [fragment.get('message'), url.searchParams.get('message')].some(message => message === partialConfirmation || /email\s+change/i.test(message || ''));
  const code = url.searchParams.get('code') || '', state = url.searchParams.get('backyVisitorState') || '', flow = url.searchParams.get('backyVisitorFlow');
  const callbackPresent = emailChange || !!url.hash || url.searchParams.has('code') || url.searchParams.has('backyVisitorRecovery') || url.searchParams.has('backyVisitorState') || url.searchParams.has('backyVisitorFlow');
  if (!callbackPresent) return { operation: null, accessToken: '', recoveryToken: '', error: '' };
  if (emailChange && (!siteId || siteId === expectedSiteId)) return { operation: 'confirm-email-change' as const, accessToken: '', recoveryToken: '', error: fragment.has('error') || url.searchParams.has('error') ? 'Email confirmation is not finished. Follow all confirmation emails, then verify your new email and password.' : '' };
  if (code && !url.hash && siteId === expectedSiteId && /^[A-Za-z0-9_-]{1,2048}$/.test(code) && /^bkv_[A-Za-z0-9_-]{43}$/.test(state) && ['signup','recovery'].includes(flow || '') && ['code','backyVisitorState','backyVisitorFlow','backySiteId'].every(key => url.searchParams.getAll(key).length === 1) && !url.searchParams.has('error') && !url.searchParams.has('backyVisitorRecovery')) return { operation: flow === 'signup' ? 'callback' as const : 'reset-password' as const, code, state, accessToken: '', recoveryToken: '', error: '' };
  if (fragment.has('error') || url.searchParams.has('error') || url.searchParams.has('code')) return { operation: null, accessToken: '', recoveryToken: '', error: 'This email callback is unavailable. Request a new email or check the identity provider callback configuration.' };
  if (type === 'recovery' && siteId === expectedSiteId && /^bkv_[A-Za-z0-9_-]{43}$/.test(recoveryToken) && accessToken && accessToken.length <= 12000) return { operation: 'reset-password' as const, accessToken, recoveryToken, error: '' };
  if (type === 'signup' && accessToken && accessToken.length <= 12000 && !recoveryToken) return { operation: 'register' as const, accessToken, recoveryToken: '', error: '' };
  return { operation: null, accessToken: '', recoveryToken: '', error: 'This account email does not match this website or uses an unsupported callback. Request a new email.' };
}
export function BackyAccount({ siteId, registrationEnabled, emailChangeAvailable = false }: { siteId: string; registrationEnabled: boolean; emailChangeAvailable?: boolean }) {
  const [mode, setMode] = useState<Mode>('login'), [member, setMember] = useState<Member | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState(''), [emailDraft, setEmailDraft] = useState('');
  const profileSaving = useRef(false);
  const emailChangeSaving = useRef(false), submitting = useRef(false);
  const recovery = useRef<Record<string, string> | null>(null), initialized = useRef(false);
  async function action(operation: string, body?: Record<string, string>) {
    const response = await fetch(`/api/backy-account/${operation}`, { method: operation === 'session' ? 'GET' : operation === 'profile' ? 'PATCH' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json(); if (!response.ok || payload.success !== true) throw new Error(typeof payload.error?.message === 'string' ? payload.error.message : 'Account request could not be completed.'); return payload.data;
  }
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    const callback = consumeVisitorCallback(window.location.href, siteId);
    // Remove user credentials and challenges before any network request or displayed error.
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname);
    if (callback.operation === 'confirm-email-change') { setMode('confirm-email-change'); setMember(null); setMessage('Follow all confirmation emails, then verify your new email and password here. This callback does not complete the change.'); if (callback.error) setError(callback.error); return; }
    if (callback.error) { setError(callback.error); return; }
    if (callback.operation === 'reset-password') { recovery.current = callback.code ? { code: callback.code, state: callback.state! } : { accessToken: callback.accessToken, recoveryToken: callback.recoveryToken }; setMode('reset-password'); setMessage('Choose a new password. The provider credential is shared across websites you joined.'); return; }
    if (callback.operation === 'register' || callback.operation === 'callback') {
      setBusy(true); action(callback.operation, callback.code ? { code: callback.code, state: callback.state! } : { accessToken: callback.accessToken }).then(data => { setMember(data.member); setMessage('You joined this website.'); }).catch(() => setError('Email confirmation could not enroll this website account. Retry or contact the website owner.')).finally(() => setBusy(false)); return;
    }
    action('session').then(data => setMember(data.member)).catch(() => { /* logged-out view; backend errors shown by real actions */ });
  }, [siteId]);
  useEffect(() => { setDisplayName(member?.displayName || ''); }, [member]);
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || profileSaving.current || !member || member.siteId !== siteId) return;
    profileSaving.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await action('profile', { displayName });
      setMember(result.member); setMessage('Display name saved.');
      try { const current = await action('session'); setMember(current.member); }
      catch { setError('Your display name was saved, but the current account could not be refreshed. Reopen the account page to check your session.'); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Display name could not be saved. Retry.'); }
    finally { profileSaving.current = false; setBusy(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || submitting.current) return;
    submitting.current = true;
    const form = event.currentTarget, data = new FormData(form); setBusy(true); setError(''); setMessage('');
    form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ''; });
    try {
      const body = Object.fromEntries(['email','password','displayName'].filter(key => data.has(key)).map(key => [key, String(data.get(key) || '')]));
      if (mode === 'reset-password') { if (!recovery.current) throw new Error('Request a new recovery email.'); Object.assign(body, recovery.current); }
      const result = await action(mode, body); form.reset();
      if (mode === 'confirm-email-change') {
        if (result.emailChanged !== true || result.signInRequired !== true) throw new Error('Email change is not complete. Confirm all provider emails and retry verification.');
        setMember(null); setMode('login'); setMessage('Email change completed. Sign in with your confirmed email.'); return;
      }
      if (result.member) setMember(result.member);
      setMessage(result.message || (result.confirmationRequired ? 'Follow the confirmation email to join this website.' : 'Signed in.'));
      if (mode === 'reset-password') { recovery.current = null; setMember(null); setMode('login'); }
    } catch (failure) {
      if (mode === 'reset-password' && recovery.current?.code) { recovery.current = null; setMode('recovery'); setError('This recovery callback could not be completed. Request a new recovery email.'); }
      else setError(failure instanceof Error ? failure.message : 'Account request could not be completed.');
    }
    finally { submitting.current = false; setBusy(false); }
  }
  async function requestEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || emailChangeSaving.current || !member || member.siteId !== siteId || !emailChangeAvailable) return;
    emailChangeSaving.current = true; setBusy(true); setError(''); setMessage('');
    const form = event.currentTarget, fields = new FormData(form), currentPassword = String(fields.get('currentPassword') || '');
    form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ''; });
    const draft = newEmail.trim(); setEmailDraft(draft);
    try {
      const result = await action('email-change', { newEmail: draft, currentPassword });
      if (result.confirmationRequired !== true || result.signInRequired !== true) throw new Error('Email change was not accepted. Check your account and retry.');
      setMember(null); setMode('confirm-email-change');
      setMessage('Follow all confirmation emails, then complete the change with your new email and password. You will need to sign in again.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Email change could not be requested. Retry after checking your account.');
      try { const current = await action('session'); setMember(current.member); }
      catch { setMember(null); setMode('confirm-email-change'); }
    } finally { emailChangeSaving.current = false; setBusy(false); }
  }
  const label = mode === 'register' ? 'Join this website' : mode === 'recovery' ? 'Recover account' : mode === 'reset-password' ? 'Set new password' : mode === 'confirm-email-change' ? 'Complete email change' : 'Sign in';
  return <main style={{ maxWidth: 520, margin: '48px auto', padding: 24 }}><h1>Website account</h1><p>This account belongs to this website. It does not grant access to Backy administration.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {member ? <><p>Signed in as {member.displayName || member.email}.</p>
      <form onSubmit={saveProfile} aria-label="Display name profile" aria-busy={busy} style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
        <label>Display name<input name="displayName" autoComplete="nickname" value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={busy} maxLength={120} style={{ display: 'block', width: '100%', minHeight: 44 }} /></label>
        <button type="submit" disabled={busy} style={{ minHeight: 44 }}>Save display name</button>
      </form>{emailChangeAvailable && <section style={{ borderTop: '1px solid #d7dee1', paddingTop: 20, marginBottom: 24 }}><h2 style={{ fontSize: '1.125rem' }}>Change email</h2><p>The provider identity is shared across websites you joined. Confirm all emails, then sign in again. Existing content and names stay retained.</p>
        <form onSubmit={requestEmailChange} aria-label="Change email" aria-busy={busy} style={{ display: 'grid', gap: 16 }}>
          <label>New email<input name="newEmail" type="email" autoComplete="email" required maxLength={254} value={newEmail} onChange={event => setNewEmail(event.target.value)} disabled={busy} style={{ display: 'block', width: '100%', minHeight: 44 }} /></label>
          <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} style={{ display: 'block', width: '100%', minHeight: 44 }} /></label>
          <button disabled={busy} type="submit" style={{ minHeight: 44 }}>{busy ? 'Requesting confirmation…' : 'Request email change'}</button>
        </form></section>}<button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await action('logout'); setMember(null); setMessage('Signed out of this website.'); } catch { setError('Sign out failed. Retry.'); } finally { setBusy(false); } }}>Sign out</button></> : <>
      <h2>{label}</h2><form onSubmit={submit} aria-busy={busy} aria-label={label} style={{ display: 'grid', gap: 16 }}>
        {mode === 'confirm-email-change' && <p>Confirm both provider emails if requested. Verification can be retried; it does not enroll you in another website.</p>}
        {mode !== 'reset-password' && <label>Email<input name="email" type="email" autoComplete="email" required disabled={busy} maxLength={254} value={emailDraft} onChange={event => setEmailDraft(event.target.value)} style={{ display: 'block', width: '100%', minHeight: 44 }} /></label>}
        {mode === 'register' && <label>Display name<input name="displayName" autoComplete="nickname" disabled={busy} maxLength={120} style={{ display: 'block', width: '100%', minHeight: 44 }} /></label>}
        {mode !== 'recovery' && <label>Password<input name="password" type="password" autoComplete={mode === 'login' || mode === 'confirm-email-change' ? 'current-password' : 'new-password'} required disabled={busy} minLength={mode === 'login' || mode === 'confirm-email-change' ? 1 : 12} maxLength={1024} style={{ display: 'block', width: '100%', minHeight: 44 }} /></label>}
        <button disabled={busy} type="submit" style={{ minHeight: 44 }}>{busy ? 'Working…' : label}</button>
      </form>{mode !== 'reset-password' && <nav aria-label="Account actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 24 }}>{(['login', ...(registrationEnabled ? ['register'] : []), 'recovery', ...(emailChangeAvailable ? ['confirm-email-change'] : [])] as Mode[]).filter(value => value !== mode).map(value => <button key={value} type="button" disabled={busy} onClick={() => { setMode(value); setError(''); setMessage(''); }} style={{ minHeight: 44 }}>{value === 'login' ? 'Sign in' : value === 'register' ? 'Join website' : value === 'confirm-email-change' ? 'Complete email change' : 'Forgot password'}</button>)}</nav>}
    </>}
  </main>;
}
