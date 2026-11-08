import {createBackyClient,type BackyVisitorEmailChangeRequest,type BackyVisitorConfirmEmailChangeRequest,type GeneratedBackyOpenApiVisitorEmailChangePendingEnvelope,type GeneratedBackyOpenApiVisitorEmailChangedEnvelope} from '../src/index';
const client=createBackyClient({baseUrl:'https://backy.fixture',siteId:'site'});
const initiation:BackyVisitorEmailChangeRequest={newEmail:'new@fixture.invalid',currentPassword:'password',returnUrl:'https://website.fixture/account'};
const completion:BackyVisitorConfirmEmailChangeRequest={email:'new@fixture.invalid',password:'password'};
const pending:Promise<GeneratedBackyOpenApiVisitorEmailChangePendingEnvelope>=client.visitorEmailChange(initiation,{origin:'https://website.fixture'});
const changed:Promise<GeneratedBackyOpenApiVisitorEmailChangedEnvelope>=client.visitorConfirmEmailChange(completion,{origin:'https://website.fixture'});
const nativePending:GeneratedBackyOpenApiVisitorEmailChangePendingEnvelope={success:true,data:{confirmationRequired:true,signInRequired:true,message:'Confirm'}};
const nativeChanged:GeneratedBackyOpenApiVisitorEmailChangedEnvelope={success:true,data:{emailChanged:true,signInRequired:true,message:'Sign in'}};
// @ts-expect-error Server-derived old identity is never an input.
const forged:BackyVisitorEmailChangeRequest={...initiation,memberId:'foreign'};
// @ts-expect-error Initiation must carry exact approved return URL.
client.visitorEmailChange({newEmail:'new@fixture.invalid',currentPassword:'password'});
// @ts-expect-error Completion requires fresh password, not provider access token.
client.visitorConfirmEmailChange({email:'new@fixture.invalid',accessToken:'provider'});
// @ts-expect-error Callback/provider200 cannot replace required stage flags.
const incomplete:GeneratedBackyOpenApiVisitorEmailChangedEnvelope={success:true,data:{emailChanged:true,message:'No'}};
// @ts-expect-error Completion is never already signed in.
const signedIn:GeneratedBackyOpenApiVisitorEmailChangedEnvelope={success:true,data:{emailChanged:true,signInRequired:false,message:'No'}};
void[pending,changed,nativePending,nativeChanged,forged,incomplete,signedIn];
