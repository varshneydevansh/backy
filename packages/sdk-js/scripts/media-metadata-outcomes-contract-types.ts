import type {BackyAdminMediaResponse,BackyClient} from '../src/index';
import type {GeneratedBackyOpenApiAdminMediaEnvelope} from '../src/generated-contract-types';
type Assert<T extends true>=T;
type Equal<A,B>=(<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2)?true:false;
type WarningParity=Assert<Equal<BackyAdminMediaResponse['data']['completionWarnings'],GeneratedBackyOpenApiAdminMediaEnvelope['data']['completionWarnings']>>;
declare const result:BackyAdminMediaResponse;
const warnings:string[]|undefined=result.data.completionWarnings;
// @ts-expect-error Committed followup warnings are string arrays, not failure objects.
result.data.completionWarnings=[{error:'private'}];
// @ts-expect-error A numeric result cannot replace the warning array.
result.data.completionWarnings=2;
declare const generated:GeneratedBackyOpenApiAdminMediaEnvelope;
const generatedWarnings:string[]|undefined=generated.data.completionWarnings;
declare const client:BackyClient;
const update:Promise<BackyAdminMediaResponse>=client.updateAdminMedia('asset',{caption:'Owner metadata'});
void [warnings,generatedWarnings,update];
