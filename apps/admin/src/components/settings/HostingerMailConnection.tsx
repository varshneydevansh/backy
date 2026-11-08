import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { adminFetch, getAdminApiBase } from '@/lib/adminContentApi';

type Probe = {
  status: 'not-configured' | 'connected' | 'failed';
  selectedMailbox?: { address: string } | null;
  missing?: string[];
  error?: string;
  outboundDeliveryVerified: boolean;
};

export function HostingerMailConnection({ disabled = false }: { disabled?: boolean }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Probe | null>(null);
  const [error, setError] = useState('');
  const check = async () => {
    if (checking || disabled) return;
    setChecking(true);
    setError('');
    try {
      const response = await adminFetch(`${getAdminApiBase()}/settings`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'hostinger-mail-probe' }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || 'Hostinger connection check failed.');
      setResult(payload.data);
    } catch (failure) {
      setResult(null);
      setError(failure instanceof Error ? failure.message : 'Hostinger connection check failed.');
    } finally { setChecking(false); }
  };

  return (
    <section className="min-w-0 rounded-lg border bg-background p-4" data-testid="hostinger-mail-connection">
      <h3 className="text-sm font-semibold">Hostinger email</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Keep your domain mailbox at Hostinger and use it for Backy notifications. Check access to the configured sender before enabling delivery.</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Server setup: BACKY_EMAIL_PROVIDER=hostinger, BACKY_HOSTINGER_MAIL_API_TOKEN and BACKY_EMAIL_FROM. The token should access only the sender mailbox. SMTP remains available as an alternative.</p>
      <Button type="button" className="mt-3 min-h-11" disabled={disabled || checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check Hostinger connection'}</Button>
      <div className="mt-3" role="status" aria-live="polite">
        {error && <Notice tone="error">{error}</Notice>}
        {result && <Notice tone={result.status === 'connected' ? 'success' : 'warning'} title={result.status === 'connected' ? 'Mailbox access verified' : 'Email connection needs setup'}>
          {result.status === 'connected' ? <p>{result.selectedMailbox?.address} is accessible. Sending and receipt still need a delivery test.</p> : <p>{result.error || `Missing server settings: ${(result.missing || []).join(', ')}`}</p>}
        </Notice>}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">This global check reads sender access only. Owner-only site mailbox inventory and plain-text reading use separate, explicit site bindings in General settings. That workspace also supports explicit compose, reply and outgoing attachments with durable send history. Mailbox and alias setup requires separate account authority and verified existing-plan capacity.</p>
    </section>
  );
}
