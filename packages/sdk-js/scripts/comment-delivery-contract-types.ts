import type {BackyClient,GeneratedBackyOpenApiOperationId} from '../src/index';
declare const client:BackyClient;
client.listCommentDeliveryAttempts({offset:100}).then(response=>{const total:number=response.data.count;const state:'pending'|'succeeded'|'failed'|'uncertain'=response.data.events[0].status;void [total,state];});
client.retryCommentDelivery('comment',{eventId:'delivery-source'}).then(response=>{const durable:'pending'|'succeeded'|'failed'|'uncertain'=response.data.delivery.durableState;const observed:'succeeded'|'failed'|'uncertain'=response.data.delivery.status;const warnings:string[]=response.data.completionWarnings;void [durable,observed,warnings];});
const operation:GeneratedBackyOpenApiOperationId='listBackyCommentDeliveryAttempts';void operation;
