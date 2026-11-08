'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackyPublicCaptcha } from './captcha';
type Comment = { id: string; parentId: string | null; content: string; authorName: string; createdAt: string; status: string };
type Policy = { enabled: boolean; allowGuests: boolean; allowReplies: boolean; requireName: boolean; requireEmail: boolean; moderationMode: string; enableCaptcha: boolean; captchaProvider: string; captchaSiteKey: string; closedMessage: string };
export function BackyWebsiteComments({ targetType, targetId, commentThreadId, blockPolicy = {} }: { targetType: 'page' | 'post'; targetId: string; commentThreadId: string; blockPolicy?: Record<string, unknown> }) {
  const [comments,setComments] = useState<Comment[]>([]), [policy,setPolicy] = useState<Policy | null>(null), [member,setMember] = useState<{ displayName: string; email: string } | null>(null), [offset,setOffset] = useState(0), [hasMore,setHasMore] = useState(false), [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState(''), [parentId,setParentId] = useState(''), [captchaToken,setCaptchaToken] = useState(''), [captchaAttempt,setCaptchaAttempt] = useState(0);
  const startedAt = useRef(0);
  const load = useCallback(async (nextOffset: number) => {
    setLoading(true); try {
      const query = new URLSearchParams({ targetType, targetId, commentThreadId, offset: String(nextOffset), limit: '20' });
      const response = await fetch('/api/backy-comments?'+query, { credentials: 'same-origin', cache: 'no-store' }), payload = await response.json(); if (!response.ok || payload.success !== true) throw new Error(payload.error?.message || 'Comments unavailable.');
      setComments(current => nextOffset === 0 ? payload.data.comments : [...current, ...payload.data.comments]); setPolicy(payload.data.policy); setOffset(nextOffset); const pagination = payload.data.pagination; setHasMore(pagination?.hasMore === true || typeof pagination?.total === 'number' && nextOffset+payload.data.comments.length < pagination.total);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Comments unavailable.'); } finally { setLoading(false); }
  }, [targetType,targetId,commentThreadId]);
  useEffect(() => { startedAt.current = Date.now(); setError(''); setMessage(''); void load(0); fetch('/api/backy-account/session', { credentials: 'same-origin', cache: 'no-store' }).then(async response => { const payload = await response.json(); if (response.ok && payload.success) setMember(payload.data.member); else setMember(null); }).catch(() => setMember(null)); }, [load]);
  const allowGuests = policy?.allowGuests === true && blockPolicy.allowGuests !== false, allowReplies = policy?.allowReplies === true && blockPolicy.allowReplies !== false, enabled = policy?.enabled === true && blockPolicy.enabled !== false;
  const captchaRequired = policy?.enableCaptcha === true || blockPolicy.enableCaptcha === true;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, parts = new FormData(form); setBusy(true); setError(''); setMessage('');
    try {
      const body: Record<string, unknown> = { targetType,targetId,commentThreadId,content: String(parts.get('content') || ''), honeypot: String(parts.get('honeypot') || ''), startedAt: startedAt.current, ...(parentId ? { parentId } : {}), ...(captchaToken ? { captchaToken } : {}) };
      if (!member) { body.authorName = String(parts.get('authorName') || ''); body.authorEmail = String(parts.get('authorEmail') || ''); }
      if (blockPolicy.allowGuests === false) body.commentAllowGuests = false; if (blockPolicy.allowReplies === false) body.commentAllowReplies = false; if (blockPolicy.requireName === true) body.commentRequireName = true; if (blockPolicy.requireEmail === true) body.commentRequireEmail = true; if (blockPolicy.enableCaptcha === true) body.commentEnableCaptcha = true; if (blockPolicy.moderationMode === 'manual') body.commentModerationMode = 'manual';
      const response = await fetch('/api/backy-comments', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), payload = await response.json();
      if (!response.ok || payload.success !== true) throw new Error(payload.error?.message || 'Comment could not be submitted.');
      setMessage(payload.data.comment?.status === 'approved' ? 'Comment published.' : 'Comment received and awaiting moderation.'); form.reset(); setParentId(''); startedAt.current = Date.now(); await load(0);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Comment could not be submitted.'); } finally { setBusy(false); if (captchaRequired) { setCaptchaToken(''); setCaptchaAttempt(value => value+1); } }
  }
  return <section data-backy-comment-thread-id={commentThreadId}><h2>Comments</h2>{loading && <p role="status">Loading comments…</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {comments.map(comment => <article key={comment.id} data-backy-comment-id={comment.id}><p><strong>{comment.authorName || 'Reader'}</strong>{comment.parentId ? ' · Reply' : ''}</p><p style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</p>{allowReplies && enabled && (allowGuests || member) && <button type="button" onClick={() => setParentId(comment.id)} style={{ minHeight: 44 }}>Reply</button>}</article>)}
    {!loading && comments.length === 0 && <p>No approved comments yet.</p>}{hasMore && <button type="button" disabled={loading} onClick={() => void load(offset+20)} style={{ minHeight: 44 }}>Load more comments</button>}
    {policy && !enabled ? <p>{policy.closedMessage}</p> : policy && !allowGuests && !member ? <p><a href="/account">Sign in to this website</a> to comment.</p> : policy && <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}><fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 16 }}>
      {member ? <p>Commenting as {member.displayName || member.email}.</p> : <><label>Name<input name="authorName" required={policy.requireName || blockPolicy.requireName === true} maxLength={120} style={{ display: 'block', width: '100%', minHeight: 44 }}/></label><label>Email<input name="authorEmail" type="email" required={policy.requireEmail || blockPolicy.requireEmail === true} maxLength={254} style={{ display: 'block', width: '100%', minHeight: 44 }}/></label></>}
      {parentId && <p>Replying to a comment. <button type="button" onClick={() => setParentId('')}>Cancel reply</button></p>}
      <label>Comment<textarea name="content" required maxLength={20000} style={{ display: 'block', width: '100%', minHeight: 96 }}/></label><label style={{ position: 'absolute', left: -10000 }} aria-hidden="true">Leave empty<input name="honeypot" tabIndex={-1} autoComplete="off"/></label>
      <BackyPublicCaptcha key={captchaAttempt} enabled={captchaRequired} provider={policy.captchaProvider} siteKey={policy.captchaSiteKey || (typeof blockPolicy.captchaSiteKey === 'string' ? blockPolicy.captchaSiteKey : '')} onToken={setCaptchaToken}/><button type="submit" disabled={busy || captchaRequired && !captchaToken} style={{ minHeight: 44 }}>{busy ? 'Submitting…' : parentId ? 'Submit reply' : 'Submit comment'}</button>
    </fieldset></form>}
  </section>;
}
