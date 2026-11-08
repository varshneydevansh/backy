import {createBackyClient,type BackyVisitorPrivacyImpact,type BackyVisitorPrivacyImpactEnvelope,type BackyOwnerCookieRequestOptions} from '../src/index';
const client=createBackyClient({baseUrl:'https://admin.fixture',siteId:'selected-site'});
const result:Promise<BackyVisitorPrivacyImpactEnvelope>=client.adminVisitorPrivacyImpact('member',{siteId:'selected-site',requestId:'review'});
const boundaries:BackyVisitorPrivacyImpact['boundaries']={contactOwnership:'ambiguous-source-submission-link',downstreamProvenance:'unknown',emailMatchedOwnership:false,contentInspected:false,erasurePerformed:false,providerChanged:false};
// @ts-expect-error Private review cannot use an explicit admin key.
const key:BackyOwnerCookieRequestOptions={adminKey:'key'};
// @ts-expect-error A read-only review never claims erasure completion.
const erased:BackyVisitorPrivacyImpact['boundaries']={...boundaries,erasurePerformed:true};
// @ts-expect-error Email-matched ownership is expressly excluded.
const matched:BackyVisitorPrivacyImpact['boundaries']={...boundaries,emailMatchedOwnership:true};
// @ts-expect-error No arbitrary sensitive payload on count-only review.
const content:BackyVisitorPrivacyImpact={schema:'backy.visitor-privacy-impact.v1',siteId:'s',memberId:'m',memberStatus:'active',observedAt:'now',reviewMode:'read-only-point-in-time',counts:{comments:0,formSubmissions:0,linkedContacts:0,commentDeliveryAttempts:{total:0,pending:0,unknownOutcome:0},formDeliveryAttempts:{total:0,pending:0,unknownOutcome:0}},boundaries,retainedCategories:['membership-identity','comments-and-moderation','submission-values-files-and-admin-metadata','source-submission-contact-copies','delivery-evidence'],email:'private@example.invalid'};
void[result,key,erased,matched,content];
