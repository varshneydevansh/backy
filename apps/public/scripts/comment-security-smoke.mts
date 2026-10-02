import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const cwd = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), 'backy-comment-security-'));
process.chdir(scratch);
process.env.BACKY_DATA_MODE = 'demo';
process.env.NODE_ENV = 'test';
try {
  const policyModule = await import('../src/lib/commentPolicy.ts');
  const policy = (policyModule.default || policyModule) as typeof policyModule;
  assert.equal(policy.resolveCommentSubmissionPolicy({ moderationMode: 'manual' }, {
    commentModerationMode: 'auto-approve',
  }).moderationMode, 'manual', 'public input must not bypass manual moderation');
  assert.equal(policy.resolveCommentSubmissionPolicy({ moderationMode: 'auto-approve' }, {
    commentModerationMode: 'manual',
  }).moderationMode, 'manual', 'a block may require stricter moderation');

  const storeModule = await import('../src/lib/backyStore.ts');
  const store = (storeModule.default || storeModule) as typeof storeModule;
  const created = store.createComment({ siteId: 'site-demo', targetType: 'page', targetId: 'page-home',
    content: 'Privacy regression fixture', authorName: 'Reader', authorEmail: 'reader@example.com',
    ipHash: 'private-network-identifier', userId: 'private-user', requestId: 'private-request', status: 'approved' });
  const postComment = store.createComment({ siteId: 'site-demo', targetType: 'post', targetId: 'post-welcome',
    content: 'Post privacy fixture', authorEmail: 'post-reader@example.com', ipHash: 'private-post-network', status: 'approved' });
  const routes = [
    ['../src/app/api/sites/[siteId]/comments/route.ts', '/comments?status=approved', { siteId: 'site-demo' }],
    ['../src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts', '/pages/page-home/comments', { siteId: 'site-demo', pageId: 'page-home' }],
    ['../src/app/api/sites/[siteId]/comments/[commentId]/route.ts', `/comments/${created.id}`, { siteId: 'site-demo', commentId: created.id }],
    ['../src/app/api/sites/[siteId]/pages/[pageId]/comments/[commentId]/route.ts', `/pages/page-home/comments/${created.id}`, { siteId: 'site-demo', pageId: 'page-home', commentId: created.id }],
    ['../src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts', '/blog/post-welcome/comments', { siteId: 'site-demo', postId: 'post-welcome' }],
    ['../src/app/api/sites/[siteId]/blog/[postId]/comments/[commentId]/route.ts', `/blog/post-welcome/comments/${postComment.id}`, { siteId: 'site-demo', postId: 'post-welcome', commentId: postComment.id }],
  ] as const;
  for (const [path, suffix, params] of routes) {
    const module = await import(path);
    const route = module.default || module;
    const response = await route.GET(new NextRequest(`http://localhost/api/sites/site-demo${suffix}`), { params: Promise.resolve(params) });
    assert.equal(response.status, 200);
    const body = await response.json();
    const fixture = suffix.startsWith('/blog') ? postComment : created;
    const comment = body.data.comment || body.data.comments.find((item: { id: string }) => item.id === fixture.id);
    assert.equal(comment.content, fixture.content);
    for (const field of ['authorEmail', 'ipHash', 'userId', 'requestId', 'reviewedBy', 'reportReasons']) {
      assert.equal(Object.hasOwn(comment, field), false, `${suffix} exposes private ${field}`);
    }
  }
  const site = store.getSiteByIdOrSlug('site-demo')!;
  store.updateAdminSite('site-demo', { settings: { commentPolicy: { ...site.settings.commentPolicy, allowGuests: false } } });
  for (const [path, suffix, params] of [routes[1], routes[4]]) {
    const module = await import(path); const route = module.default || module;
    const response = await route.POST(new NextRequest(`http://localhost/api/sites/site-demo${suffix}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Forged signed in reader', authorName: 'Guest', userId: 'claimed-account', commentUserId: 'claimed-account' }),
    }), { params: Promise.resolve(params) });
    assert.equal(response.status, 403, 'client identity hints must not bypass the guest restriction');
  }
  const reportModule = await import('../src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts');
  const report = reportModule.default || reportModule;
  const reported = await report.POST(new NextRequest(`http://localhost/api/sites/site-demo/comments/${created.id}/report`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'spam' }),
  }), { params: Promise.resolve({ siteId: 'site-demo', commentId: created.id }) });
  assert.equal(reported.status, 201);
  assert.equal(Object.hasOwn((await reported.json()).data.comment, 'authorEmail'), false, 'report receipt must not expose author identity');
  console.log(JSON.stringify({ ok: true, contract: 'backy.comment-security.v1', publicReadRoutes: routes.length }));
} finally {
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
}
