import type { BackyAdminCollectionRecordBulkResponse, BackyAdminCollectionsBackupImportResponse } from '../src/index';
import type { GeneratedBackyOpenApiAdminCollectionRecordBulkData } from '../src/generated-contract-types';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type Data = BackyAdminCollectionRecordBulkResponse['data'];
type Outcome = Assert<Equal<Data['outcome'], 'complete' | 'partial' | undefined>>;
type Applied = Assert<Equal<Data['appliedRecordIds'], string[] | undefined>>;
type Remaining = Assert<Equal<Data['notAttemptedRecordIds'], string[] | undefined>>;
type Boundary = Assert<Equal<Data['concurrencyBoundary'], 'database-per-record-transaction' | undefined>>;
type Failed = Assert<Equal<Data['failedTargets'], GeneratedBackyOpenApiAdminCollectionRecordBulkData['failedTargets']>>;
const failure: NonNullable<Data['failedTargets']>[number] = { recordId: 'two', code: 'COLLECTION_RECORD_WRITE_FAILED' };
// @ts-expect-error Provider/internal errors are not public failure codes.
const unsafe: NonNullable<Data['failedTargets']>[number] = { recordId: 'two', code: 'PRIVATE_PROVIDER_ERROR' };
type ImportWarning = NonNullable<BackyAdminCollectionsBackupImportResponse['data']['completionWarnings']>[number];
const warning: ImportWarning = 'COLLECTION_IMPORT_WEBHOOK_DELIVERY_PENDING';
// @ts-expect-error Warnings remain safe declared strings.
const badWarning: ImportWarning = { provider: 'private' };
void failure; void unsafe; void warning; void badWarning;
