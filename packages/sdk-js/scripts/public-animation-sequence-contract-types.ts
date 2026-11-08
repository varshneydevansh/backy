import type {GeneratedBackyPublicRenderPayloadAnimation,GeneratedBackyOpenApiBackyElementAnimation} from '../src/generated-contract-types';
const animation:GeneratedBackyPublicRenderPayloadAnimation={type:'custom',duration:2,sequence:{version:1,steps:[{id:'first',label:'Entrance',at:0,duration:1,from:{x:0,opacity:0},to:{x:20,opacity:1}},{id:'second',label:'Return',at:1,duration:1,to:{x:0,scale:1}}]},extension:{retained:[false,0,null]}};
const version:1|undefined=animation.sequence?.version;
const offset:number|undefined=animation.sequence?.steps[0].at;
const opacity:number|undefined=animation.sequence?.steps[0].to.opacity;
const publicSequence:NonNullable<GeneratedBackyPublicRenderPayloadAnimation['sequence']>=animation.sequence!;
const openApiSequence:NonNullable<GeneratedBackyOpenApiBackyElementAnimation['sequence']>=publicSequence;
const reverse:NonNullable<GeneratedBackyPublicRenderPayloadAnimation['sequence']>=openApiSequence;
const legacy:GeneratedBackyPublicRenderPayloadAnimation={type:'fadeIn',duration:0};
// @ts-expect-error Sequence version is a literal, not an arbitrary number.
const badVersion:NonNullable<GeneratedBackyPublicRenderPayloadAnimation['sequence']>={version:2,steps:[]};
// @ts-expect-error Sequence offsets are numeric.
const badOffset:NonNullable<GeneratedBackyPublicRenderPayloadAnimation['sequence']>={version:1,steps:[{id:'first',label:'First',at:'0',duration:1,to:{x:20}}]};
// @ts-expect-error State properties cannot serialize callback strings or numeric strings.
const badState:NonNullable<GeneratedBackyPublicRenderPayloadAnimation['sequence']>={version:1,steps:[{id:'first',label:'First',at:0,duration:1,to:{opacity:'1'}}]};
void [version,offset,opacity,publicSequence,openApiSequence,reverse,legacy,badVersion,badOffset,badState];
