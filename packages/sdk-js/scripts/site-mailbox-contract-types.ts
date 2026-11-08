import { createBackyClient, type BackyOwnerCookieRequestOptions, type GeneratedBackyOpenApiAdminSiteMailboxFolder, type GeneratedBackyOpenApiAdminSiteMailboxMessage, type GeneratedBackyOpenApiAdminSiteMailboxPagination, type GeneratedBackyOpenApiAdminSiteMailboxReadRequest } from '../src/index';
import type { HostingerMailFolder, HostingerMailMessage, HostingerMailPagination } from '../../../apps/public/src/lib/hostingerMail';
const folder: HostingerMailFolder = {} as GeneratedBackyOpenApiAdminSiteMailboxFolder;
const schemaFolder: GeneratedBackyOpenApiAdminSiteMailboxFolder = {} as HostingerMailFolder;
const message: HostingerMailMessage = {} as GeneratedBackyOpenApiAdminSiteMailboxMessage;
const schemaMessage: GeneratedBackyOpenApiAdminSiteMailboxMessage = {} as HostingerMailMessage;
const pagination: HostingerMailPagination = {} as GeneratedBackyOpenApiAdminSiteMailboxPagination;
const schemaPagination: GeneratedBackyOpenApiAdminSiteMailboxPagination = {} as HostingerMailPagination;
void [folder, schemaFolder, message, schemaMessage, pagination, schemaPagination];
const options: BackyOwnerCookieRequestOptions = { siteId: 'site-owned', requestId: 'request' };
const client = createBackyClient({ baseUrl: 'https://admin.invalid', siteId: 'site-owned' });
const inventory = client.adminSiteMailboxes(options);
const folders = client.adminSiteMailboxFolders('owned-box', { page: 1, perPage: 20 }, options);
const messages = client.adminSiteMailboxMessages('owned-box', { folder: 'INBOX', page: 1 }, options);
const read = client.readAdminSiteMailboxMessage('owned-box', 1, { folder: 'INBOX' }, options);
type Inventory = Awaited<typeof inventory>;
const compose: false = ({} as Inventory).data.capabilities.compose;
const readMarksSeen: true = ({} as Awaited<typeof read>).data.readMarksSeen;
const plainText: string = ({} as Awaited<typeof read>).data.text;
void [folders, messages, compose, readMarksSeen, plainText];
// @ts-expect-error Keys cannot authenticate Owner-cookie mailbox operations.
client.adminSiteMailboxes({ adminKey: 'key' });
// @ts-expect-error Header sessions are not the browser cookie contract.
client.adminSiteMailboxFolders('box', {}, { adminSession: 'token' });
// @ts-expect-error Raw headers cannot inject an alternate credential.
client.adminSiteMailboxes({ headers: { authorization: 'Bearer key' } });
// @ts-expect-error Required folder has no implicit INBOX default.
client.adminSiteMailboxMessages('box', {});
// @ts-expect-error Read action accepts strictly folder only.
const extraRead: GeneratedBackyOpenApiAdminSiteMailboxReadRequest = { folder: 'INBOX', html: '<b>hidden</b>' };
// @ts-expect-error No attachment data is implemented.
({} as Awaited<typeof read>).data.attachments;
// @ts-expect-error No provider resource IDs are returned.
({} as Inventory).data.mailboxes[0].resourceId;
void extraRead;
