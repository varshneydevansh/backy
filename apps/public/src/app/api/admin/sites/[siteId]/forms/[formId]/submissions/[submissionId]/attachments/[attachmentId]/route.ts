import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getFormById, getSiteByIdOrSlug, getSubmissionById } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { formAttachmentPath, formAttachmentsFromValues } from '@/lib/formAttachments';
import { getFormAttachmentStorage, FormAttachmentStorageError } from '@/lib/formAttachmentStorage';

export const runtime = 'nodejs';
type RouteParams = { params: Promise<{ siteId: string; formId: string; submissionId: string; attachmentId: string }> };
const errorResponse = (status: number, code: string, message: string, requestId: string) => NextResponse.json({ success: false, requestId, error: { code, message } }, { status, headers: { 'cache-control': 'private, no-store' } });
export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) return access;
  try {
    const { siteId, formId, submissionId, attachmentId } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.', requestId);
    const form = repositories ? await repositories.forms.getById(site.id, formId) : getFormById(site.id, formId);
    if (!form || form.siteId !== site.id) return errorResponse(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.', requestId);
    const submission = repositories ? await repositories.forms.getSubmissionById(site.id, form.id, submissionId) : getSubmissionById(submissionId);
    if (!submission || submission.siteId !== site.id || submission.formId !== form.id || submission.id !== submissionId) return errorResponse(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.', requestId);
    const attachment = formAttachmentsFromValues(submission.values).find((attachment) => attachment.attachmentId === attachmentId);
    if (!attachment) return errorResponse(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.', requestId);
    const storage = await getFormAttachmentStorage();
    const bytes = await storage.read(formAttachmentPath(site.id, form.id, attachment.attachmentId));
    if (bytes.length !== attachment.sizeBytes) return errorResponse(503, 'ATTACHMENT_UNAVAILABLE', 'The attachment is unavailable.', requestId);
    const filename = attachment.filename.replace(/[\u0000-\u001f\u007f]/g, '').replace(/["\\]/g, '_');
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'content-type': 'application/octet-stream', 'content-length': String(bytes.length),
      'content-disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-request-id': requestId,
    } });
  } catch (error) {
    if (error instanceof FormAttachmentStorageError) return errorResponse(503, 'FORM_ATTACHMENT_STORAGE_NOT_CONFIGURED', error.message, requestId);
    return errorResponse(503, 'ATTACHMENT_UNAVAILABLE', 'The attachment is unavailable.', requestId);
  }
}
