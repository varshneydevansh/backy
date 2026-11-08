/** Validate finite CUA acceptance evidence; this does not operate a browser. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const denied=read(process.argv[2]||'/tmp/backy-component-schema-denials.json');
const final=read(process.argv[3]||'/tmp/backy-component-schema-browser-proof.json');
let checks=0;const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
equal(final.baseline,denied.baseline);equal(denied.pages[0],denied.baseline.page);equal(denied.posts[0],denied.baseline.post);
const refused=denied.requests.filter(row=>row.path.endsWith('/migrate')&&row.status===422);
equal(refused.map(row=>row.response.error.code),['MIGRATION_PROPS_INCOMPATIBLE','TARGET_COMPONENT_NOT_READY']);
const paths=refused[0].response.error.details.findings;assert(paths.some(row=>row.targetType==='page')&&paths.some(row=>row.targetType==='post'));checks++;
for(const [row,before,kind,count] of [[final.pages[0],final.baseline.page,'pages',8],[final.posts[0],final.baseline.post,'blogPosts',7]]){
 const content=typeof row.content==='string'?JSON.parse(row.content):row.content,original=typeof before.content==='string'?JSON.parse(before.content):before.content;
 const element=content.elements[0],old=original.elements[0],control=element.props.controls.find(row=>row.key==='count');
 equal(element.props.version,'3.0.0');equal(element.props.count,count);equal(element.props.flags,old.props.flags);equal(element.props.fallback,old.props.fallback);equal(element.props.bindings,old.props.bindings);equal(element.dataBindings,old.dataBindings);equal(element.unknownElement,old.unknownElement);equal(element.props.unknownProps,old.props.unknownProps);equal(content.unknownRoot,original.unknownRoot);equal(row.meta.unknownMeta,before.meta.unknownMeta);
 equal(element.props.propsSchema.properties.count,{type:'integer',minimum:0,maximum:99});equal(control.type,'number');equal(control.value,count);equal(control.min,0);equal(control.max,99);equal(control.unknownControl,old.props.controls[0].unknownControl);
 const canonical=content.contentDocument.elements[0];equal(canonical.version,'3.0.0');equal(canonical.props.propsSchema,element.props.propsSchema);equal(canonical.props.count,count);equal(canonical.dataBindings,original.contentDocument.elements[0].dataBindings);equal(canonical.unknownElement,old.unknownElement);
 const disk=final.persisted[kind].find(value=>value.id===row.id);equal(disk.content,content);equal(disk.meta.unknownMeta,before.meta.unknownMeta);
 assert(final.requests.some(request=>request.method==='PATCH'&&request.path.endsWith('/'+row.id)&&request.status===200));checks++;
 assert(final.requests.filter(request=>request.method==='GET'&&request.path.endsWith('/'+row.id)&&request.status===200).length>=2);checks++;
}
const applied=final.requests.filter(row=>row.path.endsWith('/migrate')&&row.body?.dryRun===false&&row.status===200);equal(applied.length,1);equal(applied[0].response.data.outcome,'complete');equal(applied[0].response.data.summary.targets,2);equal(applied[0].response.data.failedTargets,[]);
const discovery=final.requests.find(row=>row.path.endsWith('/discovery')&&row.status===200);assert(discovery);assert(!JSON.stringify(discovery.response).includes('Schema 4.0.0'));checks++;
console.log(`PASS registered schema upgrade browser evidence (${checks} checks): incompatible/revoked denials, reviewed compatible apply, page/blog numeric controls, guarded save/reopen, binding/fallback/unknown fields and persisted disk. Boundary: actual demo handlers/editor with synthetic owner and seeded static registry; no SQL/deployment/provider proof.`);
