import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';

// Runs the saved handler against either the actual persisted demo store or the
// isolated PostgreSQL repositories. Only authorization and external followups
// are substituted; parent admission and reply persistence are real.
export async function verifyModeratorReplies({ repositories, secondaryRepositories, unsupportedRepositories, store, demo, site, other, targets, validate = () => {} }: any) {
  let denied = 0, fault = '', reads = 0, writes = 0, activities = 0, audits = 0, deliveries = 0, beforeCreate: any = null;
  let creationRepository = repositories;
  let checks = 0;
  const getParent = async (sid: string, id: string) => {
    reads++;
    return demo ? store.getCommentById(id) : repositories.comments.getById(sid, id);
  };
  const persist = async (input: any) => {
    writes++;
    if (beforeCreate) { const callback = beforeCreate; beforeCreate = null; await callback(); }
    return creationRepository.comments.create(input);
  };
  const proxy = demo ? null : { ...repositories, comments: { ...repositories.comments, getById: getParent, create: persist } };
  const mockedStore = {
    ...store,
    getSiteByIdOrSlug: (id: string) => { reads++; return store.getSiteByIdOrSlug(id); },
    getCommentById: (id: string) => { reads++; return store.getCommentById(id); },
    createComment: (input: any) => {
      writes++;
      assert.equal(input.skipActivity, true, 'The management route owns postcommit followups');
      if (beforeCreate) { const callback = beforeCreate; beforeCreate = null; callback(); }
      return store.createComment(input);
    },
    trackWebhookEvent: () => { activities++; if (fault === 'activity' || fault === 'all') throw Error('private activity credential'); },
  };
  const mocks: any = {
    '@/lib/backyStore': mockedStore,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => proxy },
    '@/lib/adminAccess': { requireAdminAccess: async (_request: any, requestId: string, options: any) => {
      if (_request.method === 'GET') { assert.equal(options.permission, 'comments.view'); return NextResponse.json({success:false,requestId,error:{code:'UNAUTHORIZED',message:'Authentication required'}},{status:401}); }
      assert.equal(options.permission, 'comments.manage');
      return denied ? NextResponse.json({ success: false, requestId, error: { code: 'DENIED', message: 'Denied' } }, { status: denied, headers: {'cache-control':'no-store'} })
        : demo ? { session: { user: { id: 'fixture-operator', fullName: 'Fixture moderator', email: 'moderator@example.invalid' } } } : { type: 'api-key', session: null };
    } },
    '@/lib/commentRepositorySupport': {
      resolveRepositorySite: async (repos: any, id: string) => { reads++; return (await repos.sites.getById(id)) || (await repos.sites.getBySlug(id)); },
      recordRepositoryInteractionEvent: async () => { activities++; if (fault === 'activity' || fault === 'all') throw Error('private activity credential'); },
    },
    '@/lib/adminAudit': { recordAdminAudit: async () => { audits++; if (fault === 'audit' || fault === 'all') throw Error('private audit credential'); } },
    '@/lib/commentDelivery': { notifyCommentDelivery: async () => { deliveries++; if (fault === 'delivery-throw') throw Error('private provider credential'); return { failedChannels: fault === 'delivery' || fault === 'all' ? 1 : 0 }; } },
    '@/lib/publicContractResponse': loadMediaFixture('../src/lib/publicContractResponse.ts', {}),
  };
  mocks['@/lib/commentPrivacy'] = loadMediaFixture('../src/lib/commentPrivacy.ts', { ...mocks, '@/lib/visitor-auth/routes': {}, '@/lib/visitor-auth/session': {} });
  mocks['@/lib/commentPolicy'] = loadMediaFixture('../src/lib/commentPolicy.ts', {});
  mocks['@/lib/commentCaptcha'] = {};
  const route = loadMediaFixture('../src/app/api/admin/sites/[siteId]/comments/[commentId]/replies/route.ts', mocks);
  const publicSite = loadMediaFixture('../src/app/api/sites/[siteId]/comments/route.ts', mocks);
  const publicLists: any = {
    page: loadMediaFixture('../src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts', mocks),
    post: loadMediaFixture('../src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts', mocks),
  };
  const publicDetails: any = {
    page: loadMediaFixture('../src/app/api/sites/[siteId]/pages/[pageId]/comments/[commentId]/route.ts', mocks),
    post: loadMediaFixture('../src/app/api/sites/[siteId]/blog/[postId]/comments/[commentId]/route.ts', mocks),
  };
  async function call(id: string, body: any, status: number, siteId = site.slug) {
    const response = await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/comments/${id}/replies`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'moderator-fixture' }, body: typeof body === 'string' ? body : JSON.stringify(body),
    }), { params: Promise.resolve({ siteId, commentId: id }) });
    const payload = await response.json();
    assert.equal(response.status, status, JSON.stringify(payload));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert(!JSON.stringify(payload).includes('credential'));
    validate(status, payload);
    checks += 3;
    return payload;
  }
  const list = async (sid = site.id) => demo ? store.listComments(sid, { status: 'all', limit: 1000 }).comments : (await repositories.comments.list({ siteId: sid, limit: 1000 })).items;
  const seed = async (target: any, sid = site.id) => {
    const input = { siteId: sid, targetType: target.type, targetId: target.id, content: 'Retained rejected parent', status: 'rejected', commentThreadId: 'thread-fixture', authorEmail: 'parent@example.invalid' };
    return demo ? store.createComment(input) : (await repositories.comments.create(input)).item;
  };
  for (const target of targets) {
    const parent = await seed(target);
    if (target.status !== 'published') {
      // Counterexample for the old admin adapter: public intake must keep
      // refusing this same discussion even though private moderation can save.
      const before = (await list()).length, prior = writes;
      const response = await publicLists[target.type].POST(new NextRequest('http://fixture.invalid', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'Legacy public endpoint reply',parentId:parent.id,moderationMode:'manual',startedAt:Date.now()-5000})}),{params:Promise.resolve({siteId:site.slug,pageId:target.id,postId:target.id})});
      assert.equal(response.status,404,JSON.stringify(await response.json()));
      assert.equal((await list()).length,before);assert.equal(writes,prior);checks+=3;
    }
    for (const mode of ['manual', 'auto-approve']) {
      const before = (await list()).length, beforeWrites = writes;
      const payload = await call(parent.id, { content: '  Archived discussion reply  ', moderationMode: mode, targetType: target.type, targetId: target.id, commentThreadId: 'thread-fixture' }, 201);
      const reply = payload.data.comment;
      assert.equal(reply.content, 'Archived discussion reply');
      assert.equal(reply.siteId, site.id); assert.equal(reply.parentId, parent.id);
      assert.equal(reply.targetType, target.type); assert.equal(reply.targetId, target.id);
      assert.equal(reply.commentThreadId, parent.commentThreadId);
      assert.equal(reply.status, mode === 'manual' ? 'pending' : 'approved');
      assert.equal(reply.userId, demo ? 'fixture-operator' : null);
      assert.deepEqual(payload.data.completionWarnings, []);
      assert.equal((await list()).length, before + 1); assert.equal(writes, beforeWrites + 1);
      assert.equal((await getParent(site.id, parent.id)).status, 'rejected');
      const visibleExpected = site.isPublished && target.status === 'published' && mode === 'auto-approve';
      const siteResponse = await publicSite.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.slug}/comments?status=approved&targetType=${target.type}&targetId=${target.id}&limit=100`), { params: Promise.resolve({ siteId: site.slug }) });
      const publicPayload = await siteResponse.json();
      assert.equal(siteResponse.status, 200, JSON.stringify(publicPayload));
      assert.equal(publicPayload.data.comments.some((row: any) => row.id === reply.id), Boolean(visibleExpected));
      assert(publicPayload.data.comments.every((row: any) => !('authorEmail' in row) && !('userId' in row)));
      const publicParams = { params: Promise.resolve({ siteId: site.slug, pageId: target.id, postId: target.id, commentId: reply.id }) };
      const listResponse = await publicLists[target.type].GET(new NextRequest('http://fixture.invalid?status=approved'), publicParams);
      assert.equal(listResponse.status, site.isPublished && target.status === 'published' ? 200 : 404, JSON.stringify(await listResponse.json()));
      const detailResponse = await publicDetails[target.type].GET(new NextRequest('http://fixture.invalid'), publicParams);
      assert.equal(detailResponse.status, mode === 'manual' ? 401 : visibleExpected ? 200 : 404, JSON.stringify(await detailResponse.json()));
      checks += 5;
      if (!demo) {
        const visible = (await repositories.comments.list({ siteId: site.id, publicOnly: true, targetType: target.type, targetId: target.id, limit: 1000 })).items;
        assert.equal(visible.some((row: any) => row.id === reply.id), Boolean(visibleExpected));
      } else {
        const visible = store.listComments(site.id, { publicOnly: true, targetType: target.type, targetId: target.id, limit: 1000 }).comments;
        assert.equal(visible.some((row: any) => row.id === reply.id), Boolean(visibleExpected));
      }
      checks += 13;
    }
    for (fault of ['activity', 'audit', 'delivery', 'delivery-throw', 'all']) {
      const before = (await list()).length, prior = writes;
      const payload = await call(parent.id, { content: 'Saved reply with incomplete followup', moderationMode: 'manual' }, 201);
      const expected = fault === 'all' ? ['COMMENT_ACTIVITY_PENDING', 'COMMENT_AUDIT_PENDING', 'COMMENT_DELIVERY_PENDING']
        : [fault === 'activity' ? 'COMMENT_ACTIVITY_PENDING' : fault === 'audit' ? 'COMMENT_AUDIT_PENDING' : 'COMMENT_DELIVERY_PENDING'];
      assert.deepEqual(payload.data.completionWarnings, expected);
      assert.equal(writes, prior + 1); assert.equal((await list()).length, before + 1);
      assert.equal((await getParent(site.id, payload.data.comment.id)).status, 'pending'); checks += 4;
    }
    fault = '';
    for (const [input, status] of [
      [{ content: 'Refused', targetType: target.type === 'page' ? 'post' : 'page' }, 409],
      [{ content: 'Refused', targetId: 'other' }, 409], [{ content: 'Refused', commentThreadId: 'other' }, 409],
      [{ content: 'Refused', userId: 'forged-owner' }, 400], [{ content: 'Refused', parentId: parent.id }, 400],
      [{ content: 'Refused', skipActivity: true }, 400], [{ content: 'Refused', rateLimitBypass: true }, 400],
      [{ content: 'Refused', moderationMode: 'pending' }, 400], [{ content: '' }, 422],
      [{ content: 'x'.repeat(5001) }, 422], [{ content: 'Refused', authorEmail: 5 }, 400], ['{broken', 400],
    ] as const) {
      const before = (await list()).length, prior = writes, followups = activities + audits + deliveries;
      await call(parent.id, input, status); assert.equal(writes, prior); assert.equal((await list()).length, before);
      assert.equal(activities + audits + deliveries, followups); checks += 3;
    }
    for (denied of [401, 403]) {
      const priorReads = reads, priorWrites = writes;
      await call(parent.id, { content: 'Denied reply' }, denied);
      assert.equal(reads, priorReads); assert.equal(writes, priorWrites); checks += 2;
    }
    denied = 0;
    const prior = writes;
    await call(parent.id, { content: 'Wrong site' }, 404, 'missing-site');
    await call(demo ? 'missing-comment' : randomUUID(), { content: 'Missing parent' }, 404);
    await call(parent.id, { content: 'Foreign parent' }, 404, other.slug);
    const orphan = await seed({ ...target, id: demo ? 'missing-target' : randomUUID() });
    await call(orphan.id, { content: 'Deleted target' }, 404); assert.equal(writes, prior); checks++;
    // Simulate another process invalidating a parent between route read and
    // repository admission. The actual store/repository must reject the write.
    const stale = await seed(target), before = (await list()).length;
    beforeCreate = () => demo ? store.deleteCommentSubtree(site.id, stale.id) : (secondaryRepositories || repositories).comments.deleteSubtree(site.id, stale.id);
    const outcome = await call(stale.id, { content: 'Stale parent' }, 409);
    assert.equal(outcome.error.code, 'COMMENT_PARENT_CONFLICT'); assert.equal((await list()).length, before - 1); checks += 2;
  }
  // Legacy roots lack an explicit widget thread. Match the existing admin
  // parent-derived key and persist it so subsequent nested replies keep it.
  const target = targets[0];
  const legacyInput = { siteId: site.id, targetType: target.type, targetId: target.id, content: 'Legacy root', status: 'rejected' };
  const legacy = demo ? store.createComment(legacyInput) : (await repositories.comments.create(legacyInput)).item;
  const first = await call(legacy.id, { content: 'Legacy root reply', commentThreadId: legacy.id, moderationMode: 'manual' }, 201);
  assert.equal(first.data.comment.commentThreadId, legacy.id);
  const nested = await call(first.data.comment.id, { content: 'Nested legacy reply', commentThreadId: legacy.id, moderationMode: 'manual' }, 201);
  assert.equal(nested.data.comment.commentThreadId, legacy.id); assert.equal(nested.data.comment.parentId, first.data.comment.id);
  const omitted = await call(legacy.id, { content: 'No client thread assertion', moderationMode: 'manual' }, 201);
  assert.equal(omitted.data.comment.commentThreadId, legacy.id); checks += 4;
  const blockedEmail = 'late-moderator-block@example.invalid', beforeBlocked = (await list()).length;
  const beforeFollowups = activities + audits + deliveries;
  beforeCreate = () => demo ? store.blockCommentIdentity({siteId:site.id,email:blockedEmail,reason:'Late fixture block'})
    : (secondaryRepositories || repositories).comments.blockIdentity({siteId:site.id,email:blockedEmail,reason:'Late fixture block'});
  const blocked = await call(legacy.id, {content:'Late blocked reply',authorEmail:blockedEmail}, 422);
  assert.equal(blocked.error.code, 'COMMENT_IDENTITY_BLOCKED'); assert.equal((await list()).length,beforeBlocked);
  assert.equal(activities + audits + deliveries,beforeFollowups); checks += 3;
  if (!demo) {
    const moving = await seed(target), beforeMove = (await list()).length;
    beforeCreate = () => (secondaryRepositories || repositories).comments.update(site.id,moving.id,{commentThreadId:'concurrent-other-thread'});
    await call(moving.id,{content:'Stale explicit thread'},409);
    assert.equal((await list()).length,beforeMove); checks++;
    if (unsupportedRepositories) {
      creationRepository = unsupportedRepositories;
      const before = (await list()).length, followups = activities + audits + deliveries;
      const unavailable = await call(legacy.id,{content:'Unsupported atomic adapter'},503);
      assert.equal(unavailable.error.code,'COMMENT_SUBMISSION_UNAVAILABLE');
      assert.equal((await list()).length,before);assert.equal(activities + audits + deliveries,followups);checks+=3;
      creationRepository = repositories;
    }
  }
  return checks;
}
