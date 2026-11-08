import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const cwd = process.cwd(), scratch = mkdtempSync('/tmp/backy-wrapper-preservation-');
process.chdir(scratch); process.env.BACKY_DATA_MODE = 'demo'; process.env.NODE_ENV = 'test';
try {
  const imported = await import('../src/lib/backyStore.ts');
  const store: any = (imported as any).default || imported;
  const extension = { version: 7, nested: { enabled: false, count: 0, unset: null }, fields: ['title', 'poster'] };
  const element = { id: 'registered-child', type: 'text', x: 0, y: 0, width: 200, height: 80, props: { content: 'Before', extension }, children: [] };
  for (const kind of ['page', 'post']) {
    const create = kind === 'page' ? store.createAdminPage : store.createAdminBlogPost;
    const update = kind === 'page' ? store.updateAdminPage : store.updateAdminBlogPost;
    const read = kind === 'page' ? store.getAdminPageById : store.getAdminBlogPostById;
    const record = create('site-demo', { title: `Wrapper ${kind}`, content: { elements: [element], canvasSize: { width: 1200, height: 500 }, frontendContract: extension, extensionFlag: false, extensionCount: 0, extensionNull: null } });
    assert.deepEqual(record.content.frontendContract, extension, `${kind} create retains wrapper extension`);
    assert.deepEqual(record.content.contentDocument.frontendContract, extension);
    const changed = update('site-demo', record.id, { content: { elements: [{ ...element, props: { ...element.props, content: 'After' } }] } });
    assert.deepEqual(changed.content.frontendContract, extension, `${kind} partial save retains wrapper extension`);
    assert.equal(changed.content.extensionFlag, false); assert.equal(changed.content.extensionCount, 0); assert.equal(changed.content.extensionNull, null);
    assert.deepEqual(read('site-demo', record.id).content, changed.content);
    const disk = JSON.parse(readFileSync(join(scratch, 'data/backy/admin-content.json'), 'utf8'));
    const persisted = (kind === 'page' ? disk.pages : disk.blogPosts).find((item: any) => item.id === record.id);
    assert.deepEqual(persisted.content, JSON.parse(JSON.stringify(changed.content)));
    const replaced = update('site-demo', record.id, { content: { elements: changed.content.elements, frontendContract: { version: 8 }, extensionFlag: null } });
    assert.deepEqual(replaced.content.frontendContract, { version: 8 }); assert.equal(replaced.content.extensionFlag, null);
    assert.equal(replaced.content.extensionCount, 0);
    const diskPath = join(scratch, 'data/backy/admin-content.json');
    const legacyDisk = JSON.parse(readFileSync(diskPath, 'utf8'));
    const legacy = (kind === 'page' ? legacyDisk.pages : legacyDisk.blogPosts).find((item: any) => item.id === record.id);
    legacy.content.legacyWrapperOnly = { retain: true, value: 0 };
    writeFileSync(diskPath, JSON.stringify(legacyDisk));
    const legacyReopen = update('site-demo', record.id, { content: { elements: replaced.content.elements } });
    assert.deepEqual(legacyReopen.content.legacyWrapperOnly, { retain: true, value: 0 });
    assert.deepEqual(legacyReopen.content.contentDocument.legacyWrapperOnly, { retain: true, value: 0 });
    const canonical = update('site-demo', record.id, { content: legacyReopen.content.contentDocument });
    assert.deepEqual(canonical.content.frontendContract, { version: 8 });
    assert.deepEqual(canonical.content.legacyWrapperOnly, { retain: true, value: 0 });
    let unsafeCalls = 0;
    const hostile: any = { elements: canonical.content.elements, safeExtension: JSON.parse('{"safe":0,"__proto__":{"polluted":true},"constructor":{"bad":true}}'), methodExtension: { retain: false, toJSON() { unsafeCalls++; return 'wrong'; } } };
    Object.defineProperty(hostile, 'getterExtension', { enumerable: true, get() { unsafeCalls++; return 'wrong'; } });
    const safe = update('site-demo', record.id, { content: hostile });
    assert.equal(unsafeCalls, 0); assert.deepEqual(safe.content.safeExtension, { safe: 0 });
    assert.deepEqual(safe.content.methodExtension, { retain: false });
    assert.equal(Object.hasOwn(safe.content, 'getterExtension'), false);
    assert.equal(({} as any).polluted, undefined);
    const reopened = JSON.parse(execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', `
      const imported = await import(${JSON.stringify(new URL('../src/lib/backyStore.ts', import.meta.url).href)});
      const store = imported.default || imported;
      const record = store.${kind === 'page' ? 'getAdminPageById' : 'getAdminBlogPostById'}('site-demo', ${JSON.stringify(record.id)});
      process.stdout.write(JSON.stringify(record.content));
    `], { cwd: scratch, env: { ...process.env, TSX_TSCONFIG_PATH: new URL('../tsconfig.json', import.meta.url).pathname }, encoding: 'utf8' }));
    assert.deepEqual(reopened, JSON.parse(JSON.stringify(safe.content)), `${kind} cold process reads actual saved disk state`);
  }
  console.log('Actual persisted demo page/post wrapper extensions PASS: create, partial/canonical save, legacy wrapper fields, fresh process disk reopen, explicit replacement/null and nested false/zero retained; unsafe keys/getters/toJSON refused. No deployed/SQL/browser claim.');
} finally { process.chdir(cwd); rmSync(scratch, { recursive: true, force: true }); }
