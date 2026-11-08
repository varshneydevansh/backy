import type { BackyClient, BackyMediaListOptions, BackyAdminMediaListOptions } from '../src/index';
import type { BackyMediaListInput } from '@backy-cms/core';
const page:BackyMediaListOptions={linkedPageId:'page',limit:2,offset:3};
const post:BackyAdminMediaListOptions={linkedPostId:'post',siteId:'site',credentials:'include'};
const repo:BackyMediaListInput={siteId:'site',linkedPageId:'page',limit:2,offset:3};
declare const client:BackyClient;
client.media(page);client.mediaCached(page);client.adminMedia(post);
// @ts-expect-error Association identifiers are strings.
const invalid:BackyMediaListOptions={linkedPageId:24};
// @ts-expect-error Repository association identifiers are strings.
const invalidRepo:BackyMediaListInput={siteId:'site',linkedPostId:false};
void [repo,invalid,invalidRepo];
