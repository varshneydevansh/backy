import {createBackyClient,type BackyOwnerCookieRequestOptions,type BackySiteMailboxAttachmentDownload,type GeneratedBackyOpenApiAdminSiteMailboxAttachment,type GeneratedBackyOpenApiAdminSiteMailboxAttachmentDownloadRequest} from '../src/index';
import type {HostingerMailAttachment} from '../../../apps/public/src/lib/hostingerMail';
const provider:HostingerMailAttachment={}as GeneratedBackyOpenApiAdminSiteMailboxAttachment;
const schema:GeneratedBackyOpenApiAdminSiteMailboxAttachment={}as HostingerMailAttachment;
const client=createBackyClient({baseUrl:'https://admin.invalid',siteId:'owned'});
const options:BackyOwnerCookieRequestOptions={siteId:'owned',requestId:'request'};
const inventory=client.adminSiteMailboxAttachments('box',1,{folder:'INBOX'},options);
const download=client.downloadAdminSiteMailboxAttachment('box',1,'opaque',{folder:'INBOX'},options);
const binary:BackySiteMailboxAttachmentDownload={}as Awaited<typeof download>;
const bytes:Uint8Array=binary.bytes;const mime:'application/octet-stream'=binary.contentType;
const nullableFilename:string|null=({}as Awaited<typeof inventory>).data.attachments[0].filename;
const compatible:boolean=({}as Awaited<ReturnType<typeof client.adminSiteMailboxes>>).data.capabilities.attachments;
void[provider,schema,bytes,mime,nullableFilename,compatible];
// @ts-expect-error Owner-cookie download cannot accept operator keys.
client.downloadAdminSiteMailboxAttachment('box',1,'opaque',{folder:'INBOX'},{adminKey:'key'});
// @ts-expect-error No raw headers/alternate session injection.
client.adminSiteMailboxAttachments('box',1,{folder:'INBOX'},{headers:{authorization:'Bearer key'}});
// @ts-expect-error Folder selection is required.
client.adminSiteMailboxAttachments('box',1,{});
// @ts-expect-error Download body cannot substitute attachment identity.
const invalid:GeneratedBackyOpenApiAdminSiteMailboxAttachmentDownloadRequest={folder:'INBOX',attachmentId:'other'};
// @ts-expect-error No public/provider URL in byte result.
binary.url;
// @ts-expect-error No private provider content ID in metadata.
({}as GeneratedBackyOpenApiAdminSiteMailboxAttachment).contentId;
void invalid;
