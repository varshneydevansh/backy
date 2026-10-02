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
  const siteRouteModule = await import(routes[0][0]);
  const siteRoute = siteRouteModule.default || siteRouteModule;
  const privateSearch = await siteRoute.GET(new NextRequest('http://localhost/api/sites/site-demo/comments?status=approved&q=reader%40example.com'), { params: Promise.resolve({ siteId: 'site-demo' }) });
  assert.equal((await privateSearch.json()).data.count, 0, 'public search must not match private email');
  const privateFilter = await siteRoute.GET(new NextRequest('http://localhost/api/sites/site-demo/comments?status=approved&requestId=private-request'), { params: Promise.resolve({ siteId: 'site-demo' }) });
  assert.equal(privateFilter.status, 401, 'request correlation filtering requires authenticated access');

  process.env.BACKY_ADMIN_API_KEY = 'comment-security-test-key';
  const reportModule = await import('../src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts');
  const report = reportModule.default || reportModule;
  for (const targetType of ['page', 'post'] as const) {
    const targetId = targetType === 'page' ? 'page-home' : 'post-welcome';
    const fixture = targetType === 'page' ? created : postComment;
    const update = targetType === 'page' ? store.updateAdminPage : store.updateAdminBlogPost;
    for (const status of ['draft', 'archived', 'scheduled'] as const) {
      update('site-demo', targetId, { status, scheduledAt: new Date(Date.now() + 86400000).toISOString() });
      const [list, nestedDetail] = targetType === 'page' ? [routes[1], routes[3]] : [routes[4], routes[5]];
      for (const [path, suffix, params] of [list, nestedDetail, [routes[2][0], `/comments/${fixture.id}`, { siteId: 'site-demo', commentId: fixture.id }]] as const) {
        const module = await import(path); const route = module.default || module;
        const response = await route.GET(new NextRequest(`http://localhost/api/sites/site-demo${suffix}`), { params: Promise.resolve(params) });
        assert.equal(response.status, 404, `${targetType} ${status} comments are not public`);
      }
      const reportResponse = await report.POST(new NextRequest(`http://localhost/api/sites/site-demo/comments/${fixture.id}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'spam' }) }), { params: Promise.resolve({ siteId: 'site-demo', commentId: fixture.id }) });
      assert.equal(reportResponse.status, 404, 'report must not reveal hidden target comments');
      const adminRead = await siteRoute.GET(new NextRequest(`http://localhost/api/sites/site-demo/comments/${fixture.id}?status=approved&targetId=${targetId}`, { headers: { 'x-backy-admin-key': process.env.BACKY_ADMIN_API_KEY } }), { params: Promise.resolve({ siteId: 'site-demo' }) });
      assert.equal((await adminRead.json()).data.count > 0, true, 'moderators retain access to comments on unpublished content');
      const module = await import(list[0]); const route = module.default || module;
      const submitted = await route.POST(new NextRequest(`http://localhost/api/sites/site-demo${list[1]}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Hidden target submission', authorName: 'Reader' }) }), { params: Promise.resolve(list[2]) });
      assert.equal(submitted.status, 404, 'unpublished target must reject submissions');
      const feed = await siteRoute.GET(new NextRequest(`http://localhost/api/sites/site-demo/comments?status=approved&targetId=${targetId}&limit=1`), { params: Promise.resolve({ siteId: 'site-demo' }) });
      const body = await feed.json();
      assert.equal(body.data.count, 0, 'public pagination counts must exclude unpublished targets');
      assert.deepEqual(body.data.comments, []);
    }
    update('site-demo', targetId, { status: 'scheduled', scheduledAt: new Date(Date.now() - 86400000).toISOString() });
    const published = await siteRoute.GET(new NextRequest(`http://localhost/api/sites/site-demo/comments?status=approved&targetId=${targetId}`), { params: Promise.resolve({ siteId: 'site-demo' }) });
    assert.equal((await published.json()).data.count > 0, true, 'due schedules must remain publicly visible');
    update('site-demo', targetId, { status: 'published' });
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
