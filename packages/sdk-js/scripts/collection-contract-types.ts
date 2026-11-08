import type { GeneratedBackyOpenApiAdminCollectionRecordPatchRequest, GeneratedBackyOpenApiAdminCollectionCreateRequest, GeneratedBackyOpenApiAdminCollectionFieldInput, GeneratedBackyOpenApiAdminCollectionsImportRequest, GeneratedBackyOpenApiAdminCollectionBindingPresetsPatchRequest, GeneratedBackyOpenApiAdminCollectionRecordBulkRequest, GeneratedBackyOpenApiAdminCollectionListEnvelope, BackyAdminCollectionsResponse, BackyAdminCollectionRecordsResponse, BackyClient } from '../src/index';
type Assert<T extends true> = T;
type Equal<A,B>=(<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2)?true:false;
type GeneratedListParity=Assert<Equal<BackyAdminCollectionsResponse,GeneratedBackyOpenApiAdminCollectionListEnvelope>>;
const template:GeneratedBackyOpenApiAdminCollectionCreateRequest={frontendDesignTemplateId:'fixture'};
const field:GeneratedBackyOpenApiAdminCollectionFieldInput={label:'Count',type:'number',defaultValue:0};
const backup:GeneratedBackyOpenApiAdminCollectionsImportRequest={data:{collections:[{name:'Entries',fields:[field],records:[{slug:'entry',values:{frontendDesignElements:[{id:'nested',children:[{registeredComponent:{version:'2'}}]}]}}]}]}};
const presets:GeneratedBackyOpenApiAdminCollectionBindingPresetsPatchRequest={presets:[{collectionId:'canonical',fieldKey:'title',extension:{retain:true}}]};
const bulk:GeneratedBackyOpenApiAdminCollectionRecordBulkRequest={action:'updateStatus',recordIds:['entry'],status:'published'};
// @ts-expect-error Unsupported collection schema status
const invalidStatus:GeneratedBackyOpenApiAdminCollectionCreateRequest={name:'Entries',status:'scheduled'};
// @ts-expect-error A known field type is required
const invalidField:GeneratedBackyOpenApiAdminCollectionFieldInput={key:'count',type:'made-up'};
// @ts-expect-error An import must use one documented envelope
const invalidBackup:GeneratedBackyOpenApiAdminCollectionsImportRequest={};
// @ts-expect-error Presets need declared collection/field identifiers
const invalidPreset:GeneratedBackyOpenApiAdminCollectionBindingPresetsPatchRequest={presets:[{collectionId:'canonical'}]};
declare const rows:BackyAdminCollectionRecordsResponse<{title:string;count:number}>;
const count:number=rows.data.records[0].values.count;
// @ts-expect-error Record value generics remain specific
const wrongCount:string=rows.data.records[0].values.count;
declare const client:BackyClient;
client.createAdminCollection(template);client.importAdminCollectionsBackup(backup);
void [field,presets,bulk,count,wrongCount];

const edit:GeneratedBackyOpenApiAdminCollectionRecordPatchRequest={expectedUpdatedAt:"2026-01-01T00:00:00Z",expectedVersion:"record-v1:"+"a".repeat(64),values:{title:"Retitled"}};
// @ts-expect-error Version must be the opaque string token
const badToken:GeneratedBackyOpenApiAdminCollectionRecordPatchRequest={expectedVersion:12};
const loadedToken:string|undefined=rows.data.records[0].version;
void [edit,badToken,loadedToken];
