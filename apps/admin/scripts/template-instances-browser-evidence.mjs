/** Validate an exported actual-browser fixture transcript; this does not automate UI. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const evidence=JSON.parse(readFileSync(process.argv[2]||'/tmp/backy-template-instances-browser-proof.json','utf8'));
let checks=0;const verify=(value,message)=>{assert.ok(value,message);checks++;};
const requests=evidence.requests;
const rows=[...evidence.pages,...evidence.posts];
const content=row=>typeof row.content==='string'?JSON.parse(row.content):row.content;
const get=title=>{const row=rows.find(r=>r.title===title);verify(row,`${title} exists`);return row;};
const page=get('Pinned page'),post=get('Pinned blog'),conflict=get('Conflicted page');
verify(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/frontend-design')&&r.status===200).length===2,'Both retained template registrations succeeded');
verify(requests.filter(r=>r.method==='POST'&&/\/(pages|blog)$/.test(r.path)&&r.status===201).length===3,'All pinned documents created by real handlers');
for(const row of [page,post]){
 const c=content(row),hero=c.elements[0],head=hero.children.find(n=>n.id==='headline'),notes=hero.children.find(n=>n.id==='notes');
 verify(head.width===640&&head.props.color==='#0f766e','Target template width/color retained');
 verify(head.responsive.mobile.width===300,'Mobile override retained');
 verify(JSON.stringify(notes.props.content).includes('after upgrade'),'Post-upgrade author edit retained');
 verify(JSON.stringify(hero.unknownSection)==='{"retain":[false,0]}','Opaque nested metadata retained');
 verify(JSON.stringify(c.metadata.extension)==='{"retained":[false,0]}','Wrapper extension retained');
 verify(row.meta.frontendTemplateInstance.templateVersion===2,'Pin advanced to retained v2');
 verify(requests.some(r=>r.method==='PATCH'&&r.path.endsWith('/'+row.id)&&r.status===200&&JSON.stringify(r.body.content).includes('after upgrade')),'Actual guarded HTTP save retained edit');
 verify(requests.some(r=>r.method==='GET'&&r.path.endsWith('/'+row.id)&&r.status===200&&JSON.stringify(r.response).includes('after upgrade')),'Actual HTTP reopen returned edit');
 const disk=[...evidence.persisted.pages,...evidence.persisted.blogPosts].find(r=>r.id===row.id);
 verify(disk&&JSON.stringify(disk).includes('after upgrade'),'Edit persisted on demo disk');
}
verify(content(conflict).elements[0].children.find(n=>n.id==='headline').width===550,'Authored conflicting width unchanged');
verify(conflict.meta.frontendTemplateInstance.templateVersion===1,'Conflicting document remains on baseline pin');
const apply=requests.filter(r=>r.body?.action==='apply');
verify(apply.length===2,'Exactly two selected applies');
for(const r of apply){verify(r.status===200&&r.response.data.outcome==='complete'&&r.response.data.appliedTargets.length===1&&r.response.data.failedTargets.length===0,'Confirmed individual apply outcome');verify(!r.body.selection.some(t=>t.id===conflict.id),'Conflicting document never selected for apply');}
const lastReview=requests.filter(r=>r.body?.action==='review'&&r.path.includes('/browser-page/')).at(-1);
verify(lastReview.response.data.targets.some(t=>t.id===conflict.id&&t.state==='blocked'&&t.conflicts.some(c=>c.code==='VALUE_CONFLICT')),'Final impact retains exact authored conflict');
verify(lastReview.response.data.targets.some(t=>t.id===page.id&&t.state==='current'),'Final impact marks safe instance current');
verify(evidence.design.templates.every(t=>t.unknownTemplate.retained),'Template extensions remain intact');
console.log(`Template instance browser evidence: ${checks} checks PASS (actual served UI/HTTP/demo disk; synthetic auth/follow-up providers, no deployment/SQL claim).`);
