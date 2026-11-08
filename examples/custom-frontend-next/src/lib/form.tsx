'use client';
import { useEffect, useRef, useState } from 'react';
import type { BackyFormFieldDefinition } from './backy-client';
import { BackyPublicCaptcha } from './captcha';
type PublicForm = { id: string; audience?: string; isActive?: boolean; fields?: BackyFormFieldDefinition[]; enableHoneypot?: boolean; enableCaptcha?: boolean; successMessage?: string };
const controlStyle = { display: 'block', width: '100%', minHeight: 44 };
export function BackyWebsiteFormField({ field }: { field: BackyFormFieldDefinition }) {
  const type = field.type || 'text', label = field.label || field.key, options = (field.options || []).map(value => typeof value === 'string' ? { label: value, value } : { label: value.label || value.value || 'Option', value: value.value || value.label || '' });
  if (type === 'textarea' || type === 'long-text') return <label>{label}<textarea name={field.key} placeholder={field.placeholder} required={field.required} style={{ ...controlStyle, minHeight: 96 }} /></label>;
  if (type === 'select') return <label>{label}<select name={field.key} required={field.required} defaultValue="" style={controlStyle}><option value="" disabled>Choose an option</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (type === 'checkbox' || type === 'boolean') return <label><input type="checkbox" name={field.key} value="true" required={field.required}/>{label}</label>;
  const inputType = ['email','tel','url','number','date','time','password','file'].includes(type) ? type : 'text';
  return <label>{label}<input name={field.key} type={inputType} placeholder={field.placeholder} required={field.required} multiple={inputType === 'file'} style={controlStyle}/>{inputType === 'file' && <small>Up to five files and 4 MiB in total. Files must pass the website's upload and safety policy.</small>}</label>;
}
export function BackyWebsiteForm({ formId, initialFields, submitLabel = 'Submit', pageId, postId, captchaProvider = '', captchaSiteKey = '', enableCaptcha = false }: { formId: string; initialFields: BackyFormFieldDefinition[]; submitLabel?: string; pageId?: string; postId?: string; captchaProvider?: string; captchaSiteKey?: string; enableCaptcha?: boolean }) {
  const [definition,setDefinition] = useState<PublicForm>({ id: formId, fields: initialFields }), [available,setAvailable] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState(''), [captchaToken,setCaptchaToken] = useState(''), [captchaAttempt,setCaptchaAttempt] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => { let current = true; startedAt.current = Date.now(); setAvailable(false); setError(''); fetch('/api/backy-form?formId='+encodeURIComponent(formId), { credentials: 'same-origin', cache: 'no-store' }).then(async response => { const payload = await response.json(); if (!response.ok || payload.success !== true) throw new Error(payload.error?.message || 'Form unavailable.'); if (current) { setDefinition(payload.data.form); setAvailable(true); } }).catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Form unavailable.'); }); return () => { current = false; }; }, [formId]);
  const fields = definition.fields || [], hasFiles = fields.some(field => field.type === 'file'), captchaRequired = definition.enableCaptcha === true || enableCaptcha;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!available || definition.isActive === false || definition.audience === 'adminOnly') return;
    const form = event.currentTarget, parts = new FormData(form); parts.set('formId', formId); parts.set('startedAt', String(startedAt.current)); if (pageId) parts.set('pageId', pageId); if (postId) parts.set('postId', postId); if (captchaToken) parts.set('captchaToken', captchaToken);
    setBusy(true); setError(''); setMessage('');
    try {
      const files = [...parts.values()].filter(value => typeof value !== 'string' && (value.size || value.name)) as File[];
      if (files.length > 5 || files.some(file => !file.size || file.size > 4*1024*1024) || files.reduce((sum,file) => sum+file.size,0) > 4*1024*1024) throw new Error('Use at most five nonempty files and 4 MiB in total.');
      const response = await fetch('/api/backy-form', { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: parts }), payload = await response.json();
      if (!response.ok || payload.success !== true) throw new Error(payload.error?.message || 'Submission could not be completed.');
      setMessage(payload.data?.message || definition.successMessage || 'Submission received.'); form.reset(); startedAt.current = Date.now();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Submission could not be completed.'); }
    finally { setBusy(false); if (captchaRequired) { setCaptchaToken(''); setCaptchaAttempt(value => value+1); } }
  }
  return <><form method="post" action="/api/backy-form" encType={hasFiles ? 'multipart/form-data' : undefined} data-backy-form-id={formId} onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
    <input type="hidden" name="formId" value={formId}/><fieldset disabled={busy || !available || definition.isActive === false || definition.audience === 'adminOnly'} style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 16 }}>{fields.map(field => <BackyWebsiteFormField key={field.key} field={field}/>)}
    {definition.enableHoneypot && <label style={{ position: 'absolute', left: -10000 }} aria-hidden="true">Leave empty<input name="honeypot" tabIndex={-1} autoComplete="off"/></label>}
    <BackyPublicCaptcha key={captchaAttempt} enabled={captchaRequired} provider={captchaProvider} siteKey={captchaSiteKey} onToken={setCaptchaToken}/>
    <button type="submit" disabled={busy || captchaRequired && !captchaToken} style={{ minHeight: 44 }}>{busy ? 'Submitting…' : submitLabel}</button></fieldset>
  </form>{!available && !error && <p role="status">Loading current form…</p>}{error && <p role="alert">{error} <a href="/account">Website account</a></p>}{definition.isActive === false && <p>This form is not accepting submissions.</p>}{definition.audience === 'adminOnly' && <p>This form is reserved for Backy operators.</p>}{message && <p role="status">{message}</p>}</>;
}
