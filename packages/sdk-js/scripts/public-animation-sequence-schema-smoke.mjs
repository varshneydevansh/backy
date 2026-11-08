import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const root=new URL('../../../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
const require=createRequire(new URL('apps/public/package.json',root)),Ajv=require('ajv/dist/2020.js').default;
const schema=JSON.parse(read('specs/ai-frontend-contract/content-payload.schema.json'));
const source=ts.createSourceFile('openapi.ts',read('apps/public/src/app/api/sites/[siteId]/openapi/route.ts'),ts.ScriptTarget.Latest,true);
let declared;
function visit(node){if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='BackyElementAnimation'){const property=node.initializer.properties.find(p=>p.name?.getText(source)==='properties');const sequence=property.initializer.properties.find(p=>p.name?.getText(source)==='sequence');declared=JSON.parse(sequence.initializer.getText(source));}ts.forEachChild(node,visit);}visit(source);
assert(declared);assert.deepEqual(schema.$defs.animation.properties.sequence,declared,'Public render must advertise the same explicit bounded sequence schema as OpenAPI');
const exports={};Function('exports',ts.transpileModule(read('packages/core/src/animation-sequence.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const ajv=new Ajv({strict:false,allErrors:true});const validate=ajv.compile({$schema:schema.$schema,$defs:schema.$defs,$ref:'#/$defs/animation'});
const step={id:'first',label:'First',at:0,duration:1,from:{x:0,opacity:0},to:{x:20,opacity:1}},sequence={version:1,steps:[step,{id:'second',label:'Second',at:1,duration:1,to:{x:0,scale:1}}]},animation={type:'custom',duration:2,sequence};let checks=1;
for(const valid of [animation,{type:'fadeIn',duration:0},{...animation,extension:{retained:[false,0,null]}},{...animation,sequence:{...sequence,extension:{retained:[false,0,null]}}},{...animation,sequence:{version:1,steps:Array.from({length:24},(_,i)=>({...step,id:String(i),at:179,duration:1}))}}]){assert(validate(valid),JSON.stringify(validate.errors));checks++;}
for(const invalid of [{...sequence,version:2},{...sequence,steps:[]},{...sequence,steps:Array.from({length:25},(_,i)=>({...step,id:String(i)}))},...['id','label','at','duration','to'].map(key=>({version:1,steps:[Object.fromEntries(Object.entries(step).filter(([k])=>k!==key))]})),...[{at:-1},{at:181},{duration:-1},{duration:61},{id:'x'.repeat(101)},{label:'x'.repeat(101)},{easing:'x'.repeat(101)},{to:{}},{to:{x:100001}},{to:{scale:101}},{to:{rotation:-100001}},{to:{opacity:1.01}},{to:{opacity:'1'}},{from:{onComplete:'callback'}},{to:{selector:'.other'}}].map(change=>({version:1,steps:[{...step,...change}]}))]){assert.equal(validate({...animation,sequence:invalid}),false,'Schema must reject malformed bounded sequence');assert.equal(exports.normalizeBackyAnimationSequence(invalid),undefined);checks+=2;}
// Ordinary JSON Schema cannot enforce unique IDs or the sum of two properties.
for(const invalid of [{version:1,steps:[step,step]},{version:1,steps:[{...step,at:179,duration:2}]}]){assert(validate({...animation,sequence:invalid}));assert.equal(exports.normalizeBackyAnimationSequence(invalid),undefined);checks+=2;}
assert.deepEqual(exports.normalizeBackyAnimationSequence(sequence),sequence);checks++;
console.log(`Public animation sequence schema passed ${checks}: exact OpenAPI parity, numeric 24-step/180-second bounds, legacy/extensions retained, runtime-only identity/end-time guards distinguished.`);
