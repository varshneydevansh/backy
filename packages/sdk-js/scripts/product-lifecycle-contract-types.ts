import type{BackyCommerceProductProviderSyncResponse,BackyCommerceProductSubscriptionsResponse,BackyCommerceProductSubscriptionActionResponse,BackyCommerceProductSubscriptionActionInput,GeneratedBackyOpenApiCommerceProductProviderSyncEnvelope,GeneratedBackyOpenApiCommerceProductSubscriptionsEnvelope,GeneratedBackyOpenApiCommerceProductSubscriptionActionEnvelope,GeneratedBackyOpenApiAdminCommerceProductSubscriptionActionRequest,GeneratedBackyOpenApiAdminCommerceProductProviderSyncRequest}from'../src/index';
type Equal<A,B>=(<T>()=>T extends A?1:2)extends(<T>()=>T extends B?1:2)?true:false;type Assert<T extends true>=T;
export type SyncParity=Assert<Equal<BackyCommerceProductProviderSyncResponse,GeneratedBackyOpenApiCommerceProductProviderSyncEnvelope>>;
export type ListParity=Assert<Equal<BackyCommerceProductSubscriptionsResponse,GeneratedBackyOpenApiCommerceProductSubscriptionsEnvelope>>;
export type ActionParity=Assert<Equal<BackyCommerceProductSubscriptionActionResponse,GeneratedBackyOpenApiCommerceProductSubscriptionActionEnvelope>>;
const action:BackyCommerceProductSubscriptionActionInput={action:'pause',subscriptionReference:'sub_fixture',providerCustomerId:'customer',recurringDetailReference:'detail'};
const request:GeneratedBackyOpenApiAdminCommerceProductSubscriptionActionRequest={action:'cancel',mollieSubscriptionId:'sub_fixture'};
const sync:GeneratedBackyOpenApiAdminCommerceProductProviderSyncRequest={provider:'woo'};
// @ts-expect-error The operation only accepts pause, resume and cancel.
const invalid:GeneratedBackyOpenApiAdminCommerceProductSubscriptionActionRequest={action:'refund'};
declare const response:BackyCommerceProductSubscriptionActionResponse;
const status:'requested'|'succeeded'|'failed'|'requires_action'=response.data.action.status;const privateValues:Record<string,unknown>=response.data.order.values;
void[action,request,sync,invalid,status,privateValues];
