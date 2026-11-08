import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getAdminApiBase } from '@/lib/adminContentApi';
import { getActiveAdminSessionToken } from '@/lib/adminSessionToken';

export type SubmissionAttachment = { kind: 'backy.form.attachment.v1'; attachmentId: string; filename: string; sizeBytes: number };
export function submissionAttachments(values: Record<string, unknown>): SubmissionAttachment[] {
  return Object.values(values).flatMap((value) => (Array.isArray(value) ? value : [value]).filter((entry): entry is SubmissionAttachment => !!entry && typeof entry === 'object'
    && entry.kind === 'backy.form.attachment.v1' && typeof entry.attachmentId === 'string' && /^[a-f0-9-]{36}$/.test(entry.attachmentId)
    && typeof entry.filename === 'string' && typeof entry.sizeBytes === 'number'));
}
export function FormSubmissionAttachments({ siteId, formId, submissionId, values }: { siteId: string; formId: string; submissionId: string; values: Record<string, unknown> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const attachments = submissionAttachments(values);
  if (!attachments.length) return null;
  const download = async (attachment: SubmissionAttachment) => {
    setBusyId(attachment.attachmentId); setError('');
    try {
      const token = getActiveAdminSessionToken();
      const response = await fetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/attachments/${attachment.attachmentId}`, {
        credentials: 'include', headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error('Unable to download this attachment. Check your form access and try again.');
      const url = URL.createObjectURL(await response.blob());
      try {
        const link = document.createElement('a'); link.href = url; link.download = attachment.filename;
        document.body.appendChild(link); link.click(); link.remove();
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to download this attachment.'); }
    finally { setBusyId(null); }
  };
  return <div className="mt-3 space-y-2" data-testid="form-submission-attachments">
    <p className="text-xs font-medium text-muted-foreground">Private attachments</p>
    {attachments.map((attachment) => <div key={attachment.attachmentId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm">
      <span className="min-w-0 break-all">{attachment.filename} <span className="text-xs text-muted-foreground">({Math.ceil(attachment.sizeBytes / 1024)} KB)</span></span>
      <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void download(attachment)} aria-label={`Download ${attachment.filename}`}>
        {busyId === attachment.attachmentId ? 'Downloading…' : 'Download'}
      </Button>
    </div>)}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
