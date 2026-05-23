import { listAdminAuditLogs, recordAdminAuditLog } from '@/lib/backyStore';
import type {
  BackyAuditLogEntry,
  BackyAuditLogListInput,
  BackyJsonObject,
  BackyRepositories,
  BackyRepositoryEntity,
} from '@backy-cms/core';

type AuditRepositories = Pick<BackyRepositories, 'auditLogs'>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

export const toAuditJsonObject = (value: unknown): BackyJsonObject | undefined => (
  isRecord(value) ? value as BackyJsonObject : undefined
);

export async function recordAdminAudit(input: {
  repositories?: AuditRepositories | null;
  siteId?: string | null;
  teamId?: string | null;
  actorId?: string | null;
  entity: BackyRepositoryEntity;
  entityId: string;
  action: BackyAuditLogEntry['action'];
  before?: unknown;
  after?: unknown;
  metadata?: BackyJsonObject;
  requestId?: string;
}): Promise<BackyAuditLogEntry> {
  const payload: Omit<BackyAuditLogEntry, 'id' | 'createdAt'> = {
    siteId: input.siteId || null,
    teamId: input.teamId || null,
    actorId: input.actorId || (input.repositories ? null : 'admin'),
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    before: toAuditJsonObject(input.before),
    after: toAuditJsonObject(input.after),
    metadata: input.metadata || {},
    requestId: input.requestId,
  };

  if (input.repositories) {
    return input.repositories.auditLogs.record(payload);
  }

  return recordAdminAuditLog(payload);
}

export async function listAdminAudit(input: {
  repositories?: AuditRepositories | null;
  filters: BackyAuditLogListInput;
}) {
  if (input.repositories) {
    return input.repositories.auditLogs.list(input.filters);
  }

  return listAdminAuditLogs(input.filters);
}
