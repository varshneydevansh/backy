import { NextRequest } from 'next/server';
import { boundedContentBytes, contentFailure, contentId, contentJson, contentRecord, fetchWebsiteContent, parseContentJson, requireContentPayload, websiteContentContext, WebsiteContentError } from './content-bff';
function target(source: Record<string, any>) {
  if (source.targetType !== 'page' && source.targetType !== 'post') throw new WebsiteContentError(400, 'INVALID_COMMENT_TARGET', 'Comments must address a page or blog post.');
  const targetId = contentId(source.targetId);
  return `/${source.targetType === 'page' ? 'pages' : 'blog'}/${encodeURIComponent(targetId)}/comments`;
}
export function publicCommentPolicy(raw: unknown) {
  const policy = contentRecord(raw);
  return { enabled: policy.enabled !== false, allowGuests: policy.allowGuests !== false, allowReplies: policy.allowReplies !== false, requireName: policy.requireName !== false, requireEmail: policy.requireEmail === true, moderationMode: policy.moderationMode === 'auto-approve' ? 'auto-approve' : 'manual', enableCaptcha: policy.enableCaptcha === true, captchaProvider: ['turnstile','hcaptcha','recaptcha'].includes(policy.captchaProvider) ? policy.captchaProvider : 'unconfigured', captchaSiteKey: typeof policy.captchaSiteKey === 'string' ? policy.captchaSiteKey : '', closedMessage: typeof policy.closedMessage === 'string' ? policy.closedMessage : 'Comments are closed.', sort: policy.sort === 'oldest' ? 'oldest' : 'newest' };
}
function publicComment(raw: unknown) { const comment = contentRecord(raw); return { id: comment.id, parentId: comment.parentId || null, content: comment.content, authorName: comment.authorName, authorWebsite: comment.authorWebsite, createdAt: comment.createdAt, status: comment.status }; }
export async function websiteComments(request: NextRequest) {
  try {
    const context = await websiteContentContext(request);
    if (request.method === 'GET') {
      const query = new URL(request.url).searchParams, source = Object.fromEntries(query), path = target(source);
      if (query.has('status') && query.get('status') !== 'approved') throw new WebsiteContentError(403, 'COMMENT_MODERATION_ROUTE_DENIED', 'Only approved public comments are available here.');
      const limit = query.get('limit') || '20', offset = query.get('offset') || '0';
      if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 || !/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset))) throw new WebsiteContentError(400, 'INVALID_COMMENT_PAGINATION', 'Use a limit from 1 to 100 and a nonnegative offset.');
      const forwarded = new URLSearchParams({ status: 'approved', limit, offset, sort: query.get('sort') === 'oldest' ? 'oldest' : 'newest' });
      if (query.get('commentThreadId')) forwarded.set('commentThreadId', contentId(query.get('commentThreadId')));
      const [listed, discovered] = await Promise.all([fetchWebsiteContent(context, `${path}?${forwarded}`), fetchWebsiteContent(context, '/manifest')]);
      const payload = await requireContentPayload(listed), manifest = await requireContentPayload(discovered), site = contentRecord(contentRecord(manifest.data).site);
      if (site.id !== context.siteId) throw new WebsiteContentError(403, 'WEBSITE_SITE_SCOPE_DENIED', 'The website identity changed. Reload.');
      const data = contentRecord(payload.data);
      return contentJson({ success: true, data: { comments: (Array.isArray(data.comments) ? data.comments : []).map(publicComment), pagination: contentRecord(data.pagination), policy: publicCommentPolicy(site.commentPolicy) } });
    }
    if (request.method !== 'POST') throw new WebsiteContentError(405, 'COMMENT_METHOD_DENIED', 'Use GET or POST.');
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new WebsiteContentError(415, 'COMMENT_JSON_REQUIRED', 'Use JSON to submit a comment.');
    const source = parseContentJson(await boundedContentBytes(request, 64 * 1024)), path = target(source), body: Record<string, unknown> = {};
    for (const key of ['content','authorName','authorEmail','authorWebsite','parentId','commentThreadId','honeypot','captchaToken','requestId']) if (typeof source[key] === 'string') body[key] = source[key];
    if (typeof source.startedAt === 'string' || typeof source.startedAt === 'number') body.startedAt = source.startedAt;
    // Public hints can only strengthen policy. The backend remains the identity and policy authority.
    for (const key of ['commentAllowGuests','commentAllowReplies']) if (source[key] === false) body[key] = false;
    for (const key of ['commentRequireName','commentRequireEmail','commentEnableCaptcha']) if (source[key] === true) body[key] = true;
    if (source.commentModerationMode === 'manual') body.commentModerationMode = 'manual';
    const payload = await requireContentPayload(await fetchWebsiteContent(context, path, { method: 'POST', body: JSON.stringify(body) })), data = contentRecord(payload.data);
    return contentJson({ success: true, data: { comment: publicComment(data.comment || payload.comment), message: typeof data.message === 'string' ? data.message : 'Comment submitted.' } });
  } catch (error) { return contentFailure(error); }
}
