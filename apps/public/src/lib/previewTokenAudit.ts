import type { BackyRepositories } from '@backy-cms/core';
import { recordAdminAudit } from '@/lib/adminAudit';

type PreviewAuditRepositories = Pick<BackyRepositories, 'auditLogs'>;

export async function recordPreviewTokenUse(input: {
  repositories?: PreviewAuditRepositories | null;
  siteId: string;
  targetType: 'page' | 'post';
  targetId: string;
  requestId: string;
  surface: 'page-api' | 'blog-api' | 'render-api' | 'resolve-api' | 'hosted-html';
  path?: string | null;
  slug?: string | null;
}) {
  await recordAdminAudit({
    repositories: input.repositories,
    siteId: input.siteId,
    actorId: 'public-preview',
    entity: input.targetType,
    entityId: input.targetId,
    action: 'previewToken.use',
    metadata: {
      targetType: input.targetType,
      targetId: input.targetId,
      surface: input.surface,
      path: input.path || null,
      slug: input.slug || null,
      tokenStored: false,
    },
    requestId: input.requestId,
  });
}
