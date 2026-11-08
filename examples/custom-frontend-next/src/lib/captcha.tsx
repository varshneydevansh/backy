'use client';
import { useEffect, useRef, useState } from 'react';
const scripts = new Map<string, Promise<void>>();
const urls: Record<string,string> = { turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit', recaptcha: 'https://www.google.com/recaptcha/api.js?render=explicit' };
function load(provider: string) {
  const url = urls[provider]; if (!url) return Promise.reject(new Error('Unsupported captcha'));
  if (!scripts.has(url)) scripts.set(url, new Promise<void>((resolve,reject) => { const script = document.createElement('script'); script.src = url; script.async = true; script.onload = () => resolve(); script.onerror = () => { scripts.delete(url); reject(new Error('Captcha unavailable')); }; document.head.appendChild(script); }));
  return scripts.get(url)!;
}
export function BackyPublicCaptcha({ enabled, provider, siteKey, onToken }: { enabled: boolean; provider: string; siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null), callback = useRef(onToken), [error,setError] = useState(''); callback.current = onToken;
  useEffect(() => {
    let cancelled = false, widgetId: unknown, api: any; callback.current(''); setError('');
    if (!enabled) return;
    if (!urls[provider] || !siteKey) { setError('Captcha requires a supported provider and public site key. Contact the website owner.'); return; }
    load(provider).then(() => {
      if (cancelled || !container.current) return; const globals = window as unknown as Record<string, any>; api = globals[provider === 'recaptcha' ? 'grecaptcha' : provider];
      if (!api?.render) throw new Error('Captcha unavailable');
      widgetId = api.render(container.current, { sitekey: siteKey, callback: (token: string) => { if (!cancelled) callback.current(token); }, 'expired-callback': () => { if (!cancelled) callback.current(''); }, 'error-callback': () => { if (!cancelled) { callback.current(''); setError('Captcha could not be completed. Reload and retry.'); } } });
    }).catch(() => { if (!cancelled) setError('Captcha could not load. Reload and retry.'); });
    return () => { cancelled = true; if (widgetId !== undefined) { if (api?.remove) api.remove(widgetId); else if (api?.reset) api.reset(widgetId); } };
  }, [enabled, provider, siteKey]);
  return enabled ? <><div ref={container} data-backy-captcha-provider={provider}/>{error && <p role="alert">{error}</p>}</> : null;
}
