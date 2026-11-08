import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
const sessionModule = await import('../src/lib/visitor-auth/session.ts');
const { newVisitorToken, visitorCookieName } = sessionModule.default || sessionModule;
const cwd = process.cwd(), scratch = mkdtempSync(join(tmpdir(),'backy-visitor-operator-'));
process.chdir(scratch); process.env.BACKY_DATA_MODE = 'database'; process.env.NODE_ENV = 'test';
try {
 const runtimeModule = await import('../src/lib/repositoryRuntime.ts'), runtime = runtimeModule.default || runtimeModule;
 runtime.setPublicRepositoryRuntimeForTests({ mode:'database',repositories:{ settings:{get:async()=>({auth:{},apiKeys:[]})},users:{getById:async()=>null},sites:{getById:async()=>null,getBySlug:async()=>null},teams:{listMembers:async()=>({items:[]})} } as any });
 const accessModule = await import('../src/lib/adminAccess.ts'), access = accessModule.default || accessModule;
 const token = newVisitorToken(); let passed = 0;
 for(const headers of [
  { cookie:`${visitorCookieName('website-a')}=${token}` },
  { authorization:`Bearer ${token}` },
  { 'x-backy-visitor-session':token },
  { 'x-backy-admin-session':token },
  { cookie:`backy_admin_session=${token}` },
 ]) {
  const response = await access.requireAdminAccess(new NextRequest('http://localhost/api/admin/sites/website-a/forms',{headers}), 'visitor-denial-proof',{permission:'forms.manage'});
  assert(response instanceof NextResponse); assert.equal(response.status,401); passed++;
 }
 console.log(`Visitor-to-operator actual shared-auth denials passed: ${passed}.`);
} finally {process.chdir(cwd);rmSync(scratch,{recursive:true,force:true});}
